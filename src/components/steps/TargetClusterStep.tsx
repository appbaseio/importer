import { useEffect, useState } from "react";
import { pingCluster } from "@/lib/esClient";
import { useImportStore } from "@/stores/useImportStore";
import { StatusBadge } from "@/components/common/StatusBadge";

export default function TargetClusterStep() {
  const store = useImportStore();
  const [url, setUrl] = useState(store.clusterUrl || "http://localhost:9200");
  const [info, setInfo] = useState<string>("");
  const [status, setStatus] = useState<number | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    // keep local state in sync when navigating back to the step
    setUrl(store.clusterUrl || url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.clusterUrl]);

  async function check() {
    try {
      console.log("[Cluster] Checking connection to", url);
      const ci = await pingCluster(url);
      console.log("[Cluster] Success status", ci.status, ci);
      store.setCluster(ci);
      setStatus(typeof ci.status === "number" ? ci.status : 200);
      setOk(true);
      // Persist auth header if present
      try {
        const u = new URL(url);
        if (u.username || u.password) {
          const auth = btoa(`${u.username}:${u.password}`);
          store.setAuthHeader(`Basic ${auth}`);
        }
      } catch {}
      setInfo(`${ci.product} ${ci.version}${ci.name ? " • " + ci.name : ""}`);
    } catch (e: any) {
      console.log("[Cluster] Error", e);
      const code =
        typeof e?.status === "number"
          ? e.status
          : typeof e?.message === "string" && /\b(\d{3})\b/.test(e.message)
          ? Number(RegExp.$1)
          : null;
      // Clear cluster on failure so Stepper disables Next
      store.setCluster(null);
      setStatus(code === 0 ? null : code);
      setOk(false);
      setInfo(
        code == null || code === 0
          ? "Error: Network or CORS blocked"
          : "Error: " + (e?.message || "Connection failed")
      );
    }
  }

  return (
    <div className="grid gap-3">
      <label className="text-sm font-medium">Cluster URL</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="border rounded-md p-2 flex-1 min-w-[260px] max-w-xl"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            store.setClusterUrl(e.target.value);
            // Invalidate prior success when URL changes
            console.log(
              "[Cluster] URL changed, clearing cluster state and status"
            );
            store.setCluster(null);
            setStatus(null);
            setOk(null);
            setInfo("");
          }}
          placeholder="https://user:pass@my-search.com"
        />
        <button
          onClick={check}
          className="px-3 py-2 rounded-md bg-primary text-white hover:bg-primary-light w-fit"
        >
          Validate connection
        </button>
      </div>
      <div className="text-sm text-neutral-700 flex items-center gap-2">
        {status != null && <StatusBadge status={status} ok={ok ?? undefined} />}
        <span>{info}</span>
      </div>
      <p className="text-xs text-neutral-500 max-w-xl">
        Basic auth in the URL is supported. Consider security/CORS when
        connecting directly from the browser.
      </p>
    </div>
  );
}
