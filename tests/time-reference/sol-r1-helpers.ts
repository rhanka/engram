/** Shared helpers for the Sol tour-1 correction tests: read the normative fixture once. */
import { readFileSync } from "node:fs";

export interface SolRule {
  id: string;
  spec: string;
  title: string;
  [k: string]: unknown;
}

const DOC = JSON.parse(
  readFileSync(new URL("./fixtures/sol-r1-rules.json", import.meta.url), "utf8"),
) as { shared: Record<string, unknown>; rules: SolRule[] };

export const SOL_SHARED = DOC.shared;

export function solRule(id: string): SolRule {
  const r = DOC.rules.find((x) => x.id === id);
  if (!r) throw new Error(`normative rule ${id} missing from sol-r1-rules.json`);
  return r;
}

/** Set a dotted path (numeric segments index arrays) on a deep clone. */
export function withPath<T>(base: T, path: string, value: unknown): T {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  const segs = path.split(".");
  let cur: unknown = out;
  for (let i = 0; i < segs.length - 1; i++) {
    cur = (cur as Record<string, unknown>)[segs[i]];
  }
  (cur as Record<string, unknown>)[segs[segs.length - 1] as string] = value;
  return out as T;
}

export function codesOf(result: { ok: boolean; errors?: { code: string }[] }): string[] {
  return result.ok ? [] : ((result.errors ?? []).map((e) => e.code));
}
