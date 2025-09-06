export async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
export function expBackoff(attempt: number, base = 300, cap = 5000) {
  const jitter = Math.random() * base;
  return Math.min(cap, base * 2 ** attempt + jitter);
}
