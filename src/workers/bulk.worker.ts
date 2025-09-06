/// <reference lib="webworker" />
import { ndjson } from "@/lib/utils";
import { expBackoff, sleep } from "@/lib/backoff";

export type BulkConfig = {
  url: string;
  index: string;
  gzip?: boolean;
  concurrency?: number; // auto if undefined → 3
  opType?: "index" | "create";
  authHeader?: string | null;
  pipeline?: string | null;
};
export type BulkStart = { type: "config"; config: BulkConfig };
export type BulkBatch = { type: "batch"; rows: any[]; idField?: string | null };
export type BulkStop = { type: "stop" };
export type BulkProgress = {
  type: "progress";
  sent: number;
  succeeded: number;
  failed: number;
  batches: number;
};
export type BulkFailures = {
  type: "failures";
  rows: Array<{ line: number; error: any; doc?: any }>;
};
export type BulkDone = { type: "done" };
export type BulkError = { type: "error"; message: string };
export type BulkDispatched = {
  type: "dispatched";
  sent: number;
  queued: number;
};

const ctx: DedicatedWorkerGlobalScope = self as any;

let cfg: BulkConfig | null = null;
let inflight = 0;
let q: Array<{ rows: any[]; idField?: string | null }> = [];
let sent = 0,
  succ = 0,
  fail = 0,
  batchesQueued = 0,
  batchesDone = 0;
let shuttingDown = false;

ctx.onmessage = async (e) => {
  const msg = e.data as BulkStart | BulkBatch | BulkStop;
  if (msg.type === "config") {
    cfg = msg.config;
    pump();
    return;
  }
  if (msg.type === "batch") {
    q.push({ rows: msg.rows, idField: msg.idField });
    pump();
    return;
  }
  if (msg.type === "stop") {
    shuttingDown = true;
    pump();
    return;
  }
};

async function pump() {
  if (!cfg) return;
  const max = cfg.concurrency ?? 3;
  while (inflight < max && q.length) {
    const job = q.shift()!;
    inflight++;
    batchesQueued++;
    bulkOnce(job.rows, job.idField).finally(() => {
      inflight--;
      pump();
    });
  }
  if (shuttingDown && inflight === 0 && q.length === 0) {
    ctx.postMessage({ type: "done" } as BulkDone);
  }
}

async function bulkOnce(rows: any[], idField?: string | null) {
  // Build NDJSON body (v1: index op with optional _id)
  const lines: any[] = [];
  for (const r of rows) {
    const meta: any = { index: { _index: cfg!.index } };
    const id = idField ? r[idField] : undefined;
    if (id != null) meta.index._id = String(id);
    lines.push(meta);
    lines.push(r);
  }
  const body = ndjson(lines);

  let attempt = 0;
  // Count docs as sent once per batch before attempting request
  sent += rows.length;
  // notify UI that we've dispatched this batch immediately
  ctx.postMessage({
    type: "dispatched",
    sent,
    queued: batchesQueued,
  } as BulkDispatched);
  // retry on 5xx, 429, 404, network
  for (;;) {
    try {
      const u = new URL(
        cfg!.url.replace(/\/$/, "") +
          "/" +
          encodeURIComponent(cfg!.index) +
          "/_bulk?refresh=false"
      );
      if (cfg!.pipeline)
        u.searchParams.set("pipeline", cfg!.pipeline as string);
      const headers: Record<string, string> = {
        "Content-Type": "application/x-ndjson",
      };
      if (cfg!.authHeader) headers["Authorization"] = cfg!.authHeader;
      const res = await fetch(u.toString(), { method: "POST", headers, body });
      if (res.status === 404 || res.status >= 500 || res.status === 429) {
        const delay = expBackoff(attempt++);
        await sleep(delay);
        if (attempt > 5)
          throw new Error(`_bulk HTTP ${res.status} after retries`);
        continue;
      }
      if (res.status < 200 || res.status >= 300)
        throw new Error(`_bulk HTTP ${res.status}`);
      const json: any = await res.json();
      let batchSent = rows.length;
      let batchSucceeded = rows.length;
      let batchFailed = 0;
      if (!json.errors) {
        succ += rows.length;
      } else {
        // gather failures and successes within this batch
        let batchSucc = 0;
        const failures: Array<{ line: number; error: any; doc?: any }> = [];
        json.items.forEach((it: any, idx: number) => {
          const res = it.index;
          if (res && res.status >= 200 && res.status < 300) {
            batchSucc++;
          } else if (res) {
            fail++;
            failures.push({ line: idx, error: res.error, doc: rows[idx] });
          }
        });
        succ += batchSucc;
        batchSucceeded = batchSucc;
        batchFailed = failures.length;
        if (failures.length)
          ctx.postMessage({ type: "failures", rows: failures } as BulkFailures);
      }
      batchesDone++;
      ctx.postMessage({
        type: "progress",
        sent,
        succeeded: succ,
        failed: fail,
        batches: batchesDone,
        batchSent,
        batchSucceeded,
        batchFailed,
      } as BulkProgress);
      return;
    } catch (e: any) {
      const delay = expBackoff(attempt++);
      await sleep(delay);
      if (attempt > 5) {
        ctx.postMessage({ type: "error", message: e.message } as BulkError);
        return;
      }
    }
  }
}
