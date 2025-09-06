import { useRef, useState, useEffect } from "react";
import { useImportStore } from "@/stores/useImportStore";

function detectFormat(file: File): "csv" | "json" | "ndjson" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  if (ext === "ndjson") return "ndjson";
  // Default to csv if unknown
  return "csv";
}

export default function UploadStep() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<"csv" | "json" | "ndjson">("csv");
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const parserRef = useRef<Worker | null>(null);
  const store = useImportStore();

  function sniffFormatFromContent(
    sample: string
  ): "csv" | "json" | "ndjson" | "unknown" {
    const s = sample.trimStart();
    if (!s) return "unknown";
    if (s.startsWith("[")) return "json";
    const firstLine =
      sample
        .split(/\r?\n/)
        .find((l) => l.trim().length > 0)
        ?.trim() || "";
    if (firstLine.startsWith("{")) return "ndjson";
    if (sample.includes(",")) return "csv";
    return "unknown";
  }

  async function isProbablyBinary(file: File): Promise<boolean> {
    const blob = await file.slice(0, 8192).arrayBuffer();
    const bytes = new Uint8Array(blob);
    // magic numbers for common binaries
    const sig = bytes.slice(0, 8);
    const hex = Array.from(sig)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const startsWith = (h: string) => hex.startsWith(h);
    if (startsWith("89504e470d0a1a0a")) return true; // PNG
    if (startsWith("ffd8ff")) return true; // JPG
    if (startsWith("47494638")) return true; // GIF
    if (startsWith("25504446")) return true; // PDF
    // text heuristic: count control chars
    let bad = 0;
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c === 9 || c === 10 || c === 13) continue;
      if (c === 0 || c < 32 || c === 127) bad++;
    }
    const ratio = bad / Math.max(1, bytes.length);
    return ratio > 0.02;
  }

  useEffect(() => {
    setPreviewRows(store.previewRows);
    setHeaders(store.previewHeaders);
    if (store.upload.file) {
      setFormat(store.upload.format);
    }
  }, [
    store.previewRows,
    store.previewHeaders,
    store.upload.file,
    store.upload.format,
  ]);

  async function handleFile(file: File) {
    if (!file) return;
    // If selecting same file twice, clear input value so onChange fires
    if (fileRef.current) fileRef.current.value = "";
    setError(null);
    // clear previous preview
    setPreviewRows([]);
    setHeaders([]);
    setTotal(0);
    store.setPreview([], []);
    // also clear previous upload metadata until new file passes validation
    store.setUpload({ file: null, total: 0, idField: null, format: "csv" });
    // terminate any previous parser to avoid race updates
    try {
      parserRef.current?.terminate();
    } catch {}
    parserRef.current = null;
    // 100MB limit
    const max = 100 * 1024 * 1024;
    if (file.size > max) {
      setError("File too large. Max 100 MB.");
      return;
    }
    const detectedFormat = detectFormat(file);
    if (!["csv", "json", "ndjson"].includes(detectedFormat)) {
      setError("Unsupported file type. Allowed: CSV, JSON (array), NDJSON.");
      return;
    }
    if (await isProbablyBinary(file)) {
      setError(
        "File appears to be binary or corrupted; expected CSV/JSON/NDJSON text."
      );
      return;
    }
    let chosen: "csv" | "json" | "ndjson" = detectedFormat;
    try {
      const sample = await file.slice(0, 8192).text();
      const sniff = sniffFormatFromContent(sample);
      if (sniff !== "unknown" && sniff !== detectedFormat) {
        setError(
          `File content looks like ${sniff.toUpperCase()} but the extension suggests ${detectedFormat.toUpperCase()}. Proceeding as ${sniff.toUpperCase()}.`
        );
        chosen = sniff;
      }
    } catch {}
    setFormat(chosen);
    store.setUpload({ file, format: chosen, total: 0 });
    // Start preview parsing
    const Parser = new Worker(
      new URL("../../workers/parser.worker.ts", import.meta.url),
      { type: "module" }
    );
    parserRef.current = Parser;
    setLoading(true);
    Parser.onmessage = (e) => {
      const m = e.data;
      if (m.type === "preview") {
        setLoading(false);
        setPreviewRows(m.rows);
        setHeaders(m.headers || []);
        setTotal(m.rows.length);
        store.setPreview(m.rows, m.headers || []);
        if (typeof m.total === "number") store.setUpload({ total: m.total });
        // auto-detect id field
        const hs: string[] = (m.headers ||
          Object.keys(m.rows?.[0] || [])) as string[];
        const detectedId = hs.includes("_id")
          ? "_id"
          : hs.includes("id")
          ? "id"
          : null;
        store.setUpload({ idField: detectedId });
      }
      if (m.type === "error") {
        console.error("Preview error:", m.message);
        setError(m.message || "Failed to parse preview");
        setLoading(false);
        // reset upload metadata UI elements on error
        store.setUpload({ file: null, total: 0, idField: null, format: "csv" });
      }
    };
    Parser.postMessage({
      type: "preview",
      fileType: chosen,
      batchSize: 100,
      file,
    });
  }

  async function loadSample() {
    try {
      // Resolve the built asset URL for the sample dataset
      const url = new URL("../../data/moviesData.json", import.meta.url);
      const resp = await fetch(url.toString());
      const txt = await resp.text();
      const blob = new Blob([txt], { type: "application/json" });
      const f = new File([blob], "moviesData.json", {
        type: "application/json",
      });
      await handleFile(f);
    } catch (e) {
      console.error("Failed to load sample dataset", e);
      setError("Failed to load sample dataset");
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Source file</label>
          <button
            type="button"
            onClick={loadSample}
            className="text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary-light"
          >
            Add sample dataset of 18,000 movies
          </button>
        </div>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? "border-primary bg-primary-light/10"
              : "border-gray-300 hover:border-primary"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,.ndjson"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="text-2xl mb-2">📁</div>
          <p className="text-sm text-gray-600">
            {store.upload.file
              ? `Selected: ${store.upload.file.name}${
                  store.upload.total
                    ? ` (Total documents: ${
                        store.upload.total
                      }, Detected format: ${store.upload.format.toUpperCase()})`
                    : ""
                }`
              : "Drop a file here or click to browse"}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Supports CSV, JSON array, NDJSON. Max 100 MB.
          </p>
        </div>
      </div>
      {loading && (
        <div className="grid gap-1">
          <div className="h-2 bg-neutral-200 rounded-full overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 w-1/3 bg-primary/60 animate-pulse rounded-full" />
          </div>
          <div className="text-xs text-neutral-600">Parsing preview…</div>
        </div>
      )}
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <div className="text-sm text-gray-600 space-y-1">
        {store.upload.idField ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
            <span>✅</span>
            <code className="font-mono">{store.upload.idField}</code>{" "}
            {store.upload.format === "csv" ? "column" : "key"} will be used as
            document ID while indexing
          </span>
        ) : (
          previewRows.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <span>⚠️</span> Your upload is missing an{" "}
              {store.upload.format === "csv" ? "id column" : "id key"}. Consider
              adding one to prevent document duplication.
            </span>
          )
        )}
      </div>
      {previewRows.length > 0 && (
        <div className="grid gap-2">
          <h4 className="font-medium">
            Preview (first {previewRows.length} rows)
          </h4>
          <div className="overflow-auto max-h-64 border rounded-md">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {(headers.length
                    ? headers
                    : Object.keys(previewRows[0] || {})
                  ).map((h) => (
                    <th key={h} className="border p-1 bg-gray-50 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    {(headers.length
                      ? headers
                      : Object.keys(previewRows[0] || {})
                    ).map((h) => (
                      <td key={h} className="border p-1 text-left">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
