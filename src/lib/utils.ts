export function joinUrl(base: string, path: string) {
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}
export function ndjson(lines: Array<object | string>) {
  return (
    lines
      .map((l) => (typeof l === "string" ? l : JSON.stringify(l)))
      .join("\n") + "\n"
  );
}
export function isHttpOk(s: number) {
  return s >= 200 && s < 300;
}
