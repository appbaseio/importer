import { create } from "zustand";
import {
  ClusterInfo,
  UploadInfo,
  IndexPlan,
  ImportStats,
  BulkFailureRow,
} from "@/lib/types";

interface State {
  step: number;
  upload: UploadInfo;
  cluster: ClusterInfo | null;
  clusterUrl?: string;
  index: IndexPlan | null;
  stats: ImportStats;
  failures: BulkFailureRow[];
  logs: string[];
  previewRows: any[];
  previewHeaders: string[];
  authHeader?: string | null;
  importRunning?: boolean;
  importDone?: boolean;
  importAutoStart?: boolean;
  parserWorker?: Worker | null;
  bulkWorker?: Worker | null;
  ingestionCache: Record<
    string,
    {
      status: string;
      statusKind: "idle" | "ok" | "warn" | "error" | "loading";
      settingsText: string;
      originalSettingsText: string;
      settingsInfo: string;
      settingsKind: "idle" | "ok" | "error" | "loading";
      settingsStatus: number | null;
    }
  >;
  lastRunSignature?: string | null;
}

interface Actions {
  setUpload: (u: Partial<UploadInfo>) => void;
  setPreview: (rows: any[], headers: string[]) => void;
  setCluster: (c: ClusterInfo | null) => void;
  setClusterUrl: (url: string) => void;
  setIndex: (i: IndexPlan) => void;
  setStats: (p: Partial<ImportStats>) => void;
  setFailures: (f: BulkFailureRow[]) => void;
  setLogs: (l: string[]) => void;
  pushLog: (line: string) => void;
  setAuthHeader: (h: string | null) => void;
  setImportRunning: (v: boolean) => void;
  setImportDone: (v: boolean) => void;
  setImportAutoStart: (v: boolean) => void;
  setParserWorker: (w: Worker | null) => void;
  setBulkWorker: (w: Worker | null) => void;
  setIngestionState: (
    key: string,
    state: Partial<{
      status: string;
      statusKind: "idle" | "ok" | "warn" | "error" | "loading";
      settingsText: string;
      originalSettingsText: string;
      settingsInfo: string;
      settingsKind: "idle" | "ok" | "error" | "loading";
      settingsStatus: number | null;
    }>
  ) => void;
  resetImportState: () => void;
  setLastRunSignature: (sig: string | null) => void;
}

type Store = State & Actions;

export const useImportStore = create<Store>((set, get) => ({
  step: 0,
  upload: { file: null, format: "csv", total: 0, idField: null },
  cluster: null,
  clusterUrl: "http://localhost:9200",
  index: null,
  stats: { total: 0, sent: 0, succeeded: 0, failed: 0, batches: 0 },
  failures: [],
  logs: [],
  previewRows: [],
  previewHeaders: [],
  authHeader: null,
  importRunning: false,
  importDone: false,
  importAutoStart: false,
  ingestionCache: {},
  lastRunSignature: null,
  setUpload: (u) => set((s) => ({ upload: { ...s.upload, ...u } })),
  setPreview: (rows, headers) =>
    set(() => ({ previewRows: rows, previewHeaders: headers })),
  setCluster: (c) =>
    set((s) => {
      // Changing cluster invalidates import state
      if (s.cluster?.url !== c?.url) {
        // @ts-ignore - call action below after state update
      }
      return { cluster: c } as any;
    }),
  setClusterUrl: (url) =>
    set((s) => {
      const changed = s.clusterUrl !== url;
      return { clusterUrl: url } as any;
    }),
  setIndex: (i) =>
    set((s) => {
      return { index: i } as any;
    }),
  setStats: (p) => set((s) => ({ stats: { ...s.stats, ...p } })),
  setFailures: (f) => set(() => ({ failures: f })),
  setLogs: (l) => set(() => ({ logs: l })),
  pushLog: (line) => set((s) => ({ logs: [...s.logs, line] })),
  setAuthHeader: (h) => set(() => ({ authHeader: h })),
  setImportRunning: (v) => set(() => ({ importRunning: v })),
  setImportDone: (v) => set(() => ({ importDone: v })),
  setImportAutoStart: (v) => set(() => ({ importAutoStart: v })),
  setParserWorker: (w) => set(() => ({ parserWorker: w })),
  setBulkWorker: (w) => set(() => ({ bulkWorker: w })),
  setIngestionState: (key, state) =>
    set((s) => ({
      ingestionCache: {
        ...s.ingestionCache,
        [key]: { ...s.ingestionCache[key], ...state },
      },
    })),
  resetImportState: () =>
    set((s) => {
      try {
        s.parserWorker?.terminate();
      } catch {}
      try {
        s.bulkWorker?.terminate();
      } catch {}
      return {
        parserWorker: null,
        bulkWorker: null,
        stats: { total: 0, sent: 0, succeeded: 0, failed: 0, batches: 0 },
        failures: [],
        logs: [],
        importRunning: false,
        importDone: false,
        lastRunSignature: null,
      } as any;
    }),
  setLastRunSignature: (sig) => set(() => ({ lastRunSignature: sig })),
}));
