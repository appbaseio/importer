import React, { useEffect, useMemo, useState } from "react";
import ReactJson from "react-json-view";

export function JsonEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [mode, setMode] = useState<"tree" | "text">("tree");

  useEffect(() => {
    try {
      const v = JSON.parse(value);
      setParsed(v);
      setError(null);
    } catch (e: any) {
      setParsed(null);
      setError(e?.message || "Invalid JSON");
    }
  }, [value]);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-xs mb-2">
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            mode === "tree" ? "bg-neutral-200" : "bg-transparent"
          }`}
          onClick={() => setMode("tree")}
        >
          Tree
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            mode === "text" ? "bg-neutral-200" : "bg-transparent"
          }`}
          onClick={() => setMode("text")}
        >
          Text
        </button>
        <span className="text-neutral-500 ml-2">
          Tip: click values to edit, use + to add and × to delete.
        </span>
      </div>
      {mode === "text" ? (
        <div className="grid gap-2">
          <textarea
            className={`border rounded-md p-2 w-full min-h-[10rem] font-mono text-xs ${
              error ? "border-rose-400 focus:outline-rose-500" : ""
            }`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
          />
          <div className="text-xs">
            {error ? (
              <span className="text-rose-600">{error}</span>
            ) : (
              <span className="text-neutral-500">Valid JSON</span>
            )}
          </div>
        </div>
      ) : (
        <div className="border rounded-md p-2 bg-neutral-50">
          <ReactJson
            name={null}
            src={parsed ?? {}}
            collapsed={2}
            enableClipboard={true}
            displayDataTypes={false}
            theme="rjv-default"
            onEdit={(edit) => {
              try {
                onChange(JSON.stringify(edit.updated_src, null, 2));
              } catch {}
              return true;
            }}
            onAdd={(add) => {
              try {
                onChange(JSON.stringify(add.updated_src, null, 2));
              } catch {}
              return true;
            }}
            onDelete={(del) => {
              try {
                onChange(JSON.stringify(del.updated_src, null, 2));
              } catch {}
              return true;
            }}
          />
        </div>
      )}
    </div>
  );
}
