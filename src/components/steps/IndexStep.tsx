import { useEffect, useState } from "react";
import { useImportStore } from "@/stores/useImportStore";
import {
  indexExists,
  createAllAsStringIndex,
  getRefreshInterval,
  getDocCount,
  getIndexSettings,
  closeIndex,
  putIndexSettings,
  openIndex,
} from "@/lib/esClient";
import { StatusBadge } from "@/components/common/StatusBadge";
import { JsonEditor } from "@/components/common/JsonEditor";

export default function IndexStep() {
  const store = useImportStore();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<
    "idle" | "ok" | "warn" | "error" | "loading"
  >("idle");
  const [settingsText, setSettingsText] = useState<string>(`{
  "index": {
    "number_of_shards": 1,
    "number_of_replicas": 1
  }
}`);
  const [settingsInfo, setSettingsInfo] = useState<string>("");
  const [settingsKind, setSettingsKind] = useState<
    "idle" | "ok" | "error" | "loading"
  >("idle");
  const [pipeline, setPipeline] = useState<string>(store.index?.pipeline || "");
  const [settingsStatus, setSettingsStatus] = useState<number | null>(null);
  const [originalSettingsText, setOriginalSettingsText] =
    useState<string>(settingsText);

  useEffect(() => {
    if (store.index) setName(store.index.name);
  }, []);

  // Rehydrate ingestion state from cache tied to cluster URL + index name
  const clusterUrl = store.cluster?.url || (store as any).clusterUrl || "";
  const cacheKey = `${clusterUrl}|${name}`;
  useEffect(() => {
    const cached = (store as any).ingestionCache?.[cacheKey];
    if (cached) {
      setStatus(cached.status || "");
      setStatusKind(cached.statusKind || "idle");
      if (cached.settingsText) setSettingsText(cached.settingsText);
      if (cached.originalSettingsText)
        setOriginalSettingsText(cached.originalSettingsText);
      setSettingsInfo(cached.settingsInfo || "");
      setSettingsKind(cached.settingsKind || "idle");
      setSettingsStatus(
        typeof cached.settingsStatus === "number" ? cached.settingsStatus : null
      );
    } else {
      // If cluster/index changed and no cache exists, clear transient statuses
      setStatus("");
      setStatusKind("idle");
      setSettingsInfo("");
      setSettingsKind("idle");
      setSettingsStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  async function ensure() {
    if (!store.cluster) {
      setStatusKind("error");
      return setStatus("Connect cluster first.");
    }
    if (!name.trim()) {
      setStatusKind("error");
      return setStatus("Please enter an index name.");
    }
    const url = store.cluster.url;
    try {
      setStatusKind("loading");
      const exists = await indexExists(url, name);
      if (!exists) {
        await createAllAsStringIndex(url, name);
        store.setIndex({
          name,
          exists: false,
          createdByUs: true,
          originalRefreshInterval: await getRefreshInterval(url, name),
        });
        setStatusKind("ok");
        setStatus("Created new index (all-as-string mapping)");
      } else {
        store.setIndex({
          name,
          exists: true,
          createdByUs: false,
          originalRefreshInterval: await getRefreshInterval(url, name),
        });
        setStatusKind("warn");
        try {
          const c = await getDocCount(url, name);
          setStatus(
            `Index exists (${c} docs). Ensure mapping compatibility to avoid errors when importing.`
          );
        } catch {
          setStatus(
            "Index exists. Ensure mapping compatibility to avoid errors when importing."
          );
        }
      }
      try {
        const s = await getIndexSettings(url, name);
        // Extract index settings block and filter system keys
        const idxSettings = s?.[name]?.settings?.index ?? s?.index ?? {};
        const filtered = filterIndexSettings(idxSettings);
        const txt = JSON.stringify({ index: filtered }, null, 2);
        setSettingsText(txt);
        setOriginalSettingsText(txt);
        (store as any).setIngestionState?.(cacheKey, {
          status: status || "",
          statusKind,
          settingsText: txt,
          originalSettingsText: txt,
          settingsInfo: "",
          settingsKind: "idle",
          settingsStatus: null,
        });
      } catch {}
    } catch (e: any) {
      setStatusKind("error");
      setStatus(
        e?.message
          ? `Index validation failed: ${e.message}`
          : "Index validation failed"
      );
      (store as any).setIngestionState?.(cacheKey, {
        status,
        statusKind: "error",
      });
    }
  }

  return (
    <div className="grid gap-3">
      <label className="text-sm font-medium">Index name</label>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="border rounded-md p-2 w-[20rem]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Set index or data stream value"
        />
        <button
          onClick={ensure}
          className="px-3 py-2 rounded-md bg-primary text-white hover:bg-primary-light w-fit"
        >
          {statusKind === "loading" ? "Validating ..." : "Validate or Create"}
        </button>
      </div>
      <p
        className={
          "text-sm " +
          (statusKind === "error"
            ? "text-rose-600"
            : statusKind === "ok"
            ? "text-green-600"
            : statusKind === "warn"
            ? "text-amber-600"
            : "text-neutral-700")
        }
      >
        {status}
      </p>
      {/* Missing id warning moved to Upload step */}
      {/* Settings editor */}
      {store.index && (
        <div className="grid gap-2 mt-2">
          <label className="text-sm font-medium">Index settings (JSON)</label>
          <JsonEditor value={settingsText} onChange={setSettingsText} />
          <button
            disabled={
              settingsKind === "loading" ||
              !canApplySettings(settingsText, originalSettingsText)
            }
            onClick={async () => {
              if (!store.cluster || !store.index) return;
              // Clear previous status row
              setSettingsStatus(null);
              setSettingsInfo("");
              setSettingsKind("loading");
              const url = store.cluster.url;
              const idx = store.index.name;
              try {
                await closeIndex(url, idx);
                let obj: any;
                try {
                  obj = JSON.parse(settingsText);
                } catch (e: any) {
                  throw new Error("Invalid JSON: " + e.message);
                }
                // Filter again before sending
                if (obj && obj.index && typeof obj.index === "object")
                  obj.index = filterIndexSettings(obj.index);
                const r = await putIndexSettings(url, idx, obj);
                setSettingsKind("ok");
                setSettingsInfo("Settings applied.");
                setSettingsStatus(r.status ?? 200);
                // Update baseline to disable button until further edits
                try {
                  setOriginalSettingsText(JSON.stringify(obj, null, 2));
                } catch {}
                (store as any).setIngestionState?.(cacheKey, {
                  settingsText,
                  originalSettingsText,
                  settingsInfo: "Settings applied.",
                  settingsKind: "ok",
                  settingsStatus: r.status ?? 200,
                });
              } catch (e: any) {
                setSettingsKind("error");
                setSettingsInfo(e?.message || "Failed to apply settings");
                setSettingsStatus(
                  typeof e?.status === "number" ? e.status : null
                );
                (store as any).setIngestionState?.(cacheKey, {
                  settingsText,
                  originalSettingsText,
                  settingsInfo: e?.message || "Failed to apply settings",
                  settingsKind: "error",
                  settingsStatus:
                    typeof e?.status === "number" ? e.status : null,
                });
              } finally {
                try {
                  await openIndex(url, idx);
                } catch {}
              }
            }}
            className="px-3 py-2 rounded-md bg-primary text-white w-fit disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary hover:bg-primary-light"
          >
            {settingsKind === "loading"
              ? "Applying settings ..."
              : "Update Settings"}
          </button>
          <div className="flex items-center gap-2">
            <StatusBadge
              status={settingsStatus ?? undefined}
              ok={settingsKind === "ok"}
            />
            <p
              className={
                "text-sm " +
                (settingsKind === "error"
                  ? "text-rose-600"
                  : settingsKind === "ok"
                  ? "text-green-600"
                  : "text-neutral-700")
              }
            >
              {settingsInfo}
            </p>
          </div>
        </div>
      )}
      {/* Pipeline */}
      {store.index && (
        <div className="grid gap-1 mt-2">
          <label className="text-sm font-medium">
            Ingest pipeline Id{" "}
            <span className="text-xs font-small text-gray-500">optional</span>
          </label>
          <input
            className="border rounded-md p-2 w-[20rem]"
            placeholder="pipeline-id"
            value={pipeline}
            onChange={(e) => {
              setPipeline(e.target.value);
              store.setIndex({
                ...store.index!,
                pipeline: e.target.value || null,
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

function filterIndexSettings(idx: any) {
  if (!idx || typeof idx !== "object") return idx;
  const clone: any = Array.isArray(idx) ? [...idx] : { ...idx };
  // Remove index-level system keys
  delete clone.uuid;
  delete clone.provided_name;
  delete clone.creation_date;
  // Non-updatable on existing index
  delete clone.number_of_shards;
  delete clone.version;
  return clone;
}

function normalizeJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

function canApplySettings(current: string, original: string): boolean {
  const cur = normalizeJson(current);
  const base = normalizeJson(original);
  if (!cur || !base) return false;
  return cur !== base;
}
