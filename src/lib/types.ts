export type Product = "elasticsearch" | "opensearch";
export interface ClusterInfo {
  url: string;
  version: string;
  name?: string;
  product: Product;
  status?: number;
}
export interface UploadInfo {
  file: File | null;
  format: "csv" | "json" | "ndjson";
  total: number;
  headers?: string[];
  idField?: string | null;
}
export interface IndexPlan {
  name: string;
  exists: boolean;
  createdByUs: boolean;
  originalRefreshInterval?: string | null;
  pipeline?: string | null;
}
export interface ImportStats {
  total: number;
  sent: number;
  succeeded: number;
  failed: number;
  batches: number;
  startedAt?: number;
  endedAt?: number;
}
export type BulkErrorItem = {
  status: number;
  type?: string;
  reason?: string;
  _id?: string;
};
export type BulkFailureRow = { line: number; error: BulkErrorItem; doc?: any };
