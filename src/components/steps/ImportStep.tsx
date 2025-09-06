import { useEffect, useRef, useState } from "react";
import { useImportStore } from "@/stores/useImportStore";
import {
  getRefreshInterval,
  setRefreshInterval,
  refreshIndex,
} from "@/lib/esClient";

export default function ImportStep() {
  const store = useImportStore();
  const clusterUrl = store.cluster?.url || (store as any).clusterUrl || "";
  const indexName = store.index?.name || "";
  const fileSig = store.upload.file
    ? `${store.upload.file.name}:${store.upload.file.size}`
    : "";
  const settingsSig = (() => {
    // Use the original baseline text from ingestion cache if available
    const key = `${clusterUrl}|${indexName}`;
    const cache = (store as any).ingestionCache?.[key];
    return cache?.originalSettingsText || "";
  })();
  const runSignature = `${clusterUrl}|${indexName}|${fileSig}|${settingsSig}`;
  const [progress, setProgress] = useState({
    sent: store.stats.sent || 0,
    succeeded: store.stats.succeeded || 0,
    failed: store.stats.failed || 0,
    batches: store.stats.batches || 0,
  });
  const [log, setLog] = useState<string[]>(
    (store.lastRunSignature === runSignature ? store.logs : []) || []
  );
  const [running, setRunning] = useState(
    store.lastRunSignature === runSignature ? !!store.importRunning : false
  );
  const failuresRef = useRef<any[]>([]);
  const startedRef = useRef(false);

  // Build cluster URL with embedded basic auth for Dejavu if available
  const clusterHrefForDejavu = (() => {
    let href = store.cluster?.url ?? "";
    try {
      const u = new URL(href);
      const auth: string | null | undefined = (store as any).authHeader;
      if (auth && auth.startsWith("Basic ")) {
        const b64 = auth.slice(6).trim();
        try {
          const creds = atob(b64);
          const [user, ...rest] = creds.split(":");
          const pass = rest.join(":");
          if (user) {
            u.username = user;
            u.password = pass;
          }
        } catch {}
      }
      href = u.toString();
    } catch {}
    return href;
  })();

  function appendLog(line: string) {
    setLog((v) => {
      if (v[v.length - 1] === line) return v;
      return [...v, line];
    });
    const last = store.logs[store.logs.length - 1];
    if (last !== line) (store as any).pushLog?.(line);
  }

  // Auto-start import when entering this step if flagged by the Stepper
  useEffect(() => {
    // If signature changed, reset import state
    if (store.lastRunSignature && store.lastRunSignature !== runSignature) {
      (store as any).resetImportState?.();
    }
    (store as any).setLastRunSignature?.(runSignature);
    if (
      (store as any).importAutoStart &&
      !running &&
      !store.importDone &&
      !startedRef.current
    ) {
      startedRef.current = true;
      start().finally(() => (store as any).setImportAutoStart?.(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (
      (store as any).startImportRequested &&
      !running &&
      !store.importDone &&
      !startedRef.current
    ) {
      startedRef.current = true;
      start();
      (store as any).setStartImportRequested?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(store as any).startImportRequested]);

  async function start() {
    if (!store.upload.file) return alert("Choose a file in Upload step");
    if (!store.cluster || !store.index)
      return alert("Configure cluster and index");
    // If already running, just rebind handlers to existing workers
    if (
      store.importRunning &&
      (store as any).parserWorker &&
      (store as any).bulkWorker
    ) {
      bindHandlers((store as any).parserWorker, (store as any).bulkWorker);
      return;
    }
    setRunning(true);
    store.setImportRunning(true);
    const url = store.cluster.url;
    const idx = store.index.name;

    // set refresh_interval = -1
    const prev = await getRefreshInterval(url, idx);
    store.index.originalRefreshInterval = prev;
    await setRefreshInterval(url, idx, "-1");

    // spin up workers (reuse if already created in this session)
    const existingParser = (store as any).parserWorker as Worker | undefined;
    const existingBulk = (store as any).bulkWorker as Worker | undefined;
    const Parser =
      existingParser ??
      new Worker(new URL("../../workers/parser.worker.ts", import.meta.url), {
        type: "module",
      });
    const Bulk =
      existingBulk ??
      new Worker(new URL("../../workers/bulk.worker.ts", import.meta.url), {
        type: "module",
      });
    (store as any).setParserWorker?.(Parser);
    (store as any).setBulkWorker?.(Bulk);
    // Only configure Bulk once
    if (!existingBulk) {
      Bulk.postMessage({
        type: "config",
        config: {
          url,
          index: idx,
          concurrency: 3,
          authHeader: (store as any).authHeader ?? null,
          pipeline: store.index?.pipeline ?? null,
        },
      });
    }

    bindHandlers(Parser, Bulk);
    // Only start parser once per session
    if (!existingParser) {
      Parser.postMessage({
        type: "start",
        fileType: store.upload.format,
        batchSize: 1000,
        file: store.upload.file,
      });
    }
  }

  function bindHandlers(Parser: Worker, Bulk: Worker) {
    Parser.onmessage = (e) => {
      const m = e.data;
      if (m.type === "batch") {
        Bulk.postMessage({
          type: "batch",
          rows: m.rows,
          idField: store.upload.idField ?? null,
        });
      }
      if (m.type === "done") {
        if (typeof m.total === "number") store.setStats({ total: m.total });
        Bulk.postMessage({ type: "stop" });
      }
      if (m.type === "error") appendLog("Parser error: " + m.message);
    };

    Bulk.onmessage = (e) => {
      const m = e.data;
      if (m.type === "dispatched") {
        // Update sent immediately when a batch is dispatched
        setProgress((p) => ({ ...p, sent: m.sent }));
        store.setStats({ sent: m.sent });
        return;
      }
      if (m.type === "progress") {
        setProgress(m);
        store.setStats({
          sent: m.sent,
          succeeded: m.succeeded,
          failed: m.failed,
          batches: m.batches,
        });
        const bs = m.batchSucceeded ?? undefined;
        const bf = m.batchFailed ?? undefined;
        const bt = m.batchSent ?? undefined;
        if (bs != null && bf != null && bt != null) {
          appendLog(
            `Batch #${m.batches} succeeded=${bs} failed=${bf} sent=${bt}`
          );
        } else {
          // fallback to cumulative if batch fields are not present
          appendLog(
            `Batch #${m.batches} succeeded=${m.succeeded} failed=${m.failed} sent=${m.sent}`
          );
        }
      }
      if (m.type === "failures") failuresRef.current.push(...m.rows);
      if (m.type === "error") appendLog("Bulk error: " + m.message);
      if (m.type === "done") finalize();
    };
  }

  let finalized = false;
  async function finalize() {
    if (finalized) return;
    finalized = true;
    if (!store.cluster || !store.index) return;
    const url = store.cluster.url;
    const idx = store.index.name;
    await refreshIndex(url, idx);
    if (store.index.originalRefreshInterval) {
      await setRefreshInterval(url, idx, store.index.originalRefreshInterval);
    } else {
      await setRefreshInterval(url, idx, "1s");
    }
    setRunning(false);
    store.setImportRunning(false);
    // force progress to full on completion
    store.setStats({ sent: store.stats.total });
    setProgress((p) => ({ ...p, sent: store.stats.total }));
    store.setImportDone(true);
    appendLog("Import complete");
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <div className="text-sm flex items-center gap-2 grow justify-end">
          Sent: {progress.sent} • OK: {progress.succeeded} • Failed:{" "}
          {progress.failed}{" "}
          {store.importDone && <span className="text-green-600">Done</span>}
        </div>
      </div>
      {(running || progress.sent > 0) && (
        <div className="grid gap-1">
          {store.stats.total ? (
            <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (progress.sent / store.stats.total) * 100
                  )}%`,
                }}
              />
            </div>
          ) : (
            <div className="h-2 bg-neutral-200 rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 w-1/3 bg-primary/60 animate-pulse rounded-full" />
            </div>
          )}
        </div>
      )}
      {log.length > 0 && (
        <div className="grid gap-2">
          <h4 className="font-medium">Log</h4>
          <pre className="bg-neutral-50 p-3 rounded-md text-xs max-h-48 overflow-auto">
            {log.join("\n")}
          </pre>
        </div>
      )}
      {failuresRef.current.length > 0 && (
        <div className="grid gap-2">
          <h4 className="font-medium">Failures (sample)</h4>
          <pre className="bg-rose-50 p-3 rounded-md text-xs max-h-48 overflow-auto">
            {JSON.stringify(failuresRef.current.slice(0, 20), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
