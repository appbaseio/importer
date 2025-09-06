/// <reference lib="webworker" />
import Papa from "papaparse";

export type ParseMsg = {
  type: "start" | "preview";
  fileType: "csv" | "json" | "ndjson";
  csv?: { delimiter?: string; header?: boolean };
  batchSize: number;
};

export type ParsedBatch = { type: "batch"; rows: any[]; count: number };
export type ParsedDone = { type: "done"; total: number };
export type ParsedPreview = {
  type: "preview";
  rows: any[];
  headers?: string[];
  total?: number;
};
export type ParsedError = { type: "error"; message: string };

const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.onmessage = async (e) => {
  const msg = e.data as ParseMsg;
  try {
    const file = (e as any).data.file as File;
    const batchSize = msg.batchSize || 1000;

    if (msg.type === "preview") {
      // Parse first 100 rows for preview
      if (msg.fileType === "csv") {
        let total = 0;
        const rows: any[] = [];
        let headers: string[] | undefined;
        let firstJSONString = "";
        Papa.parse(file, {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
          worker: false,
          step: (res: any) => {
            total += 1;
            headers = headers || (res.meta?.fields as string[] | undefined);
            if (rows.length < 100) rows.push(res.data);
            if (rows.length <= 3) {
              try {
                firstJSONString += JSON.stringify(res.data);
              } catch {}
            }
          },
          complete: (res) => {
            const errs = res.errors || [];
            const textiness = (() => {
              try {
                const s = firstJSONString;
                if (!s) return 1;
                let bad = 0;
                for (let i = 0; i < s.length; i++) {
                  const c = s.charCodeAt(i);
                  if (c === 9 || c === 10 || c === 13) continue;
                  if (c < 32 || c === 127) bad++;
                }
                return bad / s.length;
              } catch {
                return 1;
              }
            })();
            if (
              errs.length > 0 ||
              !headers ||
              headers.length === 0 ||
              textiness > 0.02
            ) {
              const msg =
                errs[0]?.message ||
                "CSV appears to be invalid or binary/corrupted.";
              ctx.postMessage({
                type: "error",
                message: msg,
              } satisfies ParsedError);
              return;
            }
            ctx.postMessage({
              type: "preview",
              rows,
              headers,
              total,
            } satisfies ParsedPreview);
          },
          error: (err) =>
            ctx.postMessage({
              type: "error",
              message: err.message,
            } satisfies ParsedError),
        });
        return;
      }
      if (msg.fileType === "ndjson") {
        const text = await file.text();
        const all = text.split(/\r?\n/).filter(Boolean);
        const lines = all.slice(0, 100);
        const rows: any[] = [];
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          try {
            rows.push(JSON.parse(ln));
          } catch (e: any) {
            ctx.postMessage({
              type: "error",
              message: `Invalid JSON on line ${i + 1}: ${e.message}`,
            } satisfies ParsedError);
            return;
          }
        }
        const headers = rows.length ? Object.keys(rows[0]) : [];
        ctx.postMessage({
          type: "preview",
          rows,
          headers,
          total: all.length,
        } satisfies ParsedPreview);
        return;
      }
      if (msg.fileType === "json") {
        const text = await file.text();
        let arr: any;
        try {
          arr = JSON.parse(text);
        } catch (e: any) {
          ctx.postMessage({
            type: "error",
            message: `Invalid JSON: ${e.message}`,
          } satisfies ParsedError);
          return;
        }
        if (!Array.isArray(arr)) throw new Error("JSON must be an array in v1");
        const rows = arr.slice(0, 100);
        const headers = rows.length ? Object.keys(rows[0]) : [];
        ctx.postMessage({
          type: "preview",
          rows,
          headers,
          total: arr.length,
        } satisfies ParsedPreview);
        return;
      }
    }

    if (msg.type === "start") {
      // Full parsing
      if (msg.fileType === "csv") {
        Papa.parse(file, {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
          worker: false,
          chunk: (res, parser) => {
            const rows: any[] = res.data as any[];
            let i = 0;
            while (i < rows.length) {
              const slice = rows.slice(i, i + batchSize);
              ctx.postMessage({
                type: "batch",
                rows: slice,
                count: slice.length,
              } satisfies ParsedBatch);
              i += batchSize;
            }
          },
          complete: (res) => {
            ctx.postMessage({
              type: "done",
              total: (res.data as any[]).length,
            } satisfies ParsedDone);
          },
          error: (err) =>
            ctx.postMessage({
              type: "error",
              message: err.message,
            } satisfies ParsedError),
        });
        return;
      }

      if (msg.fileType === "ndjson") {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        let buf: any[] = [];
        let total = 0;
        for (let idx = 0; idx < lines.length; idx++) {
          const ln = lines[idx];
          try {
            buf.push(JSON.parse(ln));
          } catch (e: any) {
            ctx.postMessage({
              type: "error",
              message: `Invalid JSON on line ${idx + 1}: ${e.message}`,
            } satisfies ParsedError);
            return;
          }
          if (buf.length >= batchSize) {
            ctx.postMessage({
              type: "batch",
              rows: buf,
              count: buf.length,
            } satisfies ParsedBatch);
            total += buf.length;
            buf = [];
          }
        }
        if (buf.length) {
          ctx.postMessage({
            type: "batch",
            rows: buf,
            count: buf.length,
          } satisfies ParsedBatch);
          total += buf.length;
        }
        ctx.postMessage({ type: "done", total } satisfies ParsedDone);
        return;
      }

      if (msg.fileType === "json") {
        const text = await file.text();
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) throw new Error("JSON must be an array in v1");
        let i = 0;
        while (i < arr.length) {
          const slice = arr.slice(i, i + batchSize);
          ctx.postMessage({
            type: "batch",
            rows: slice,
            count: slice.length,
          } satisfies ParsedBatch);
          i += batchSize;
        }
        ctx.postMessage({
          type: "done",
          total: arr.length,
        } satisfies ParsedDone);
        return;
      }
    }
  } catch (e: any) {
    ctx.postMessage({
      type: "error",
      message: e.message,
    } satisfies ParsedError);
  }
};
