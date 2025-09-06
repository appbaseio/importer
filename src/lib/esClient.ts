import { ClusterInfo, IndexPlan, BulkErrorItem } from "./types";
import { useImportStore } from "@/stores/useImportStore";
import { joinUrl, isHttpOk } from "./utils";

export async function pingCluster(url: string): Promise<ClusterInfo> {
  const parsedUrl = new URL(url);
  const headers: Record<string, string> = {};
  let fetchUrl = url;
  if (parsedUrl.username || parsedUrl.password) {
    const auth = btoa(`${parsedUrl.username}:${parsedUrl.password}`);
    headers["Authorization"] = `Basic ${auth}`;
    parsedUrl.username = "";
    parsedUrl.password = "";
    fetchUrl = parsedUrl.toString();
    // persist for future calls
    try {
      useImportStore.getState().authHeader = `Basic ${auth}`;
    } catch {}
  }
  let res: Response;
  try {
    res = await fetch(joinUrl(fetchUrl, "/"), { method: "GET", headers });
  } catch (e: any) {
    throw { message: e?.message || "Network error", status: 0 };
  }
  if (!isHttpOk(res.status)) {
    throw { message: `Cluster ping failed`, status: res.status };
  }
  const h: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    h[key] = value;
  });
  const data: any = await res.json();
  const version: string = data?.version?.number ?? "unknown";
  const name: string = data?.name;
  const product =
    h["x-elastic-product"] === "Elasticsearch" ||
    /elastic/.test(h["x-elastic-product"] || "")
      ? "elasticsearch"
      : data?.version?.distribution === "opensearch"
      ? "opensearch"
      : "elasticsearch";
  return { url: fetchUrl, version, name, product, status: res.status };
}

export async function getDocCount(url: string, name: string) {
  const headers: Record<string, string> = {};
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(joinUrl(url, `/${encodeURIComponent(name)}/_count`), {
    method: "GET",
    headers,
  });
  if (!isHttpOk(res.status)) throw new Error(`_count failed: ${res.status}`);
  const j = await res.json();
  return typeof j?.count === "number" ? j.count : 0;
}

export async function indexExists(url: string, name: string) {
  const headers: Record<string, string> = {};
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(joinUrl(url, `/${encodeURIComponent(name)}`), {
    method: "HEAD",
    headers,
  });
  return res.status === 200;
}

export async function getRefreshInterval(url: string, name: string) {
  const headers: Record<string, string> = {};
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(
    joinUrl(url, `/${name}/_settings/index.refresh_interval`),
    { headers }
  );
  if (!isHttpOk(res.status)) return null;
  const json = await res.json();
  return json?.[name]?.settings?.index?.refresh_interval ?? null;
}

export async function setRefreshInterval(
  url: string,
  name: string,
  value: string
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(joinUrl(url, `/${name}/_settings`), {
    method: "PUT",
    headers,
    body: JSON.stringify({ index: { refresh_interval: value } }),
  });
  if (!isHttpOk(res.status))
    throw new Error(`Failed to set refresh_interval: ${res.status}`);
}

export async function createAllAsStringIndex(url: string, name: string) {
  const body = {
    settings: { index: { number_of_shards: 1, number_of_replicas: 1 } },
    mappings: {
      dynamic: true,
      dynamic_templates: [
        {
          strings_as_text_keyword: {
            match_mapping_type: "string",
            mapping: {
              type: "text",
              fields: { keyword: { type: "keyword", ignore_above: 32766 } },
            },
          },
        },
      ],
    },
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(joinUrl(url, `/${name}`), {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 400) {
    const t = await res.text();
    throw new Error(`Index create error: ${t}`);
  }
  if (!isHttpOk(res.status))
    throw new Error(`Index create failed: ${res.status}`);
}

export async function getIndexSettings(url: string, name: string) {
  const headers: Record<string, string> = {};
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(
    joinUrl(url, `/${encodeURIComponent(name)}/_settings`),
    { method: "GET", headers }
  );
  if (!isHttpOk(res.status))
    throw { message: `_settings failed: ${res.status}`, status: res.status };
  return res.json();
}

export async function closeIndex(url: string, name: string) {
  const headers: Record<string, string> = {};
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(joinUrl(url, `/${encodeURIComponent(name)}/_close`), {
    method: "POST",
    headers,
  });
  if (!isHttpOk(res.status))
    throw { message: `_close failed: ${res.status}`, status: res.status };
}

export async function openIndex(url: string, name: string) {
  const headers: Record<string, string> = {};
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(joinUrl(url, `/${encodeURIComponent(name)}/_open`), {
    method: "POST",
    headers,
  });
  if (!isHttpOk(res.status))
    throw { message: `_open failed: ${res.status}`, status: res.status };
}

export async function putIndexSettings(
  url: string,
  name: string,
  settings: any
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(
    joinUrl(url, `/${encodeURIComponent(name)}/_settings`),
    { method: "PUT", headers, body: JSON.stringify(settings) }
  );
  if (!isHttpOk(res.status))
    throw {
      message: `_settings update failed: ${res.status}`,
      status: res.status,
    };
  return { status: res.status };
}

export type BulkResult = {
  took: number;
  errors: boolean;
  items: Array<{
    index?: { status: number; error?: BulkErrorItem; _id?: string };
  }>;
};

export async function bulkToIndex(
  url: string,
  index: string,
  ndjsonBody: string,
  gzip?: boolean,
  refreshFalse = true
) {
  const u = new URL(joinUrl(url, `/${index}/_bulk`));
  if (refreshFalse) u.searchParams.set("refresh", "false");
  const headers: Record<string, string> = {
    "Content-Type": "application/x-ndjson",
  };
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  let body: BodyInit = ndjsonBody;
  if (gzip) {
    const { gzip: gzipFn } = await import("pako");
    const gz = gzipFn(ndjsonBody);
    headers["Content-Encoding"] = "gzip";
    body = new Blob([gz]);
  }
  const res = await fetch(u.toString(), { method: "POST", headers, body });
  if (!isHttpOk(res.status)) throw new Error(`_bulk HTTP ${res.status}`);
  return res.json() as Promise<BulkResult>;
}

export async function refreshIndex(url: string, name: string) {
  const headers: Record<string, string> = {};
  try {
    const a = useImportStore.getState().authHeader;
    if (a) headers["Authorization"] = a;
  } catch {}
  const res = await fetch(joinUrl(url, `/${name}/_refresh`), {
    method: "POST",
    headers,
  });
  if (!isHttpOk(res.status)) throw new Error(`Refresh failed: ${res.status}`);
}
