// `engram archi check|fmt` — strict gate for engram.archi-mermaid/1 files.
// check: parse, reject `@dl gap` unless --allow-gap, run checkArchi.
// fmt: print canonical bytes (formatArchiMermaid), --write rewrites in place.
import { readFileSync, writeFileSync } from "node:fs";
import { formatArchiMermaid, parseArchiMermaid } from "./archi-mermaid/index.js";
import { ARCHI_CARDS_CONTENT } from "./ontology-guardian/archi-cards-data.js";
import { checkArchi } from "./ontology-guardian/archi-check.js";
import { sortDiagnostics, type EngramDiagnostic } from "./ontology-guardian/diagnostics.js";

export const ARCHI_GAP_FORBIDDEN_CODE = "archi-gap-forbidden";

const GAP_LINE_RE = /^%%\s+@dl\s+gap(?:\s|$)/;

export type ArchiCheckResult = { readonly ok: boolean; readonly file: string; readonly diagnostics: readonly EngramDiagnostic[] };

function gapDiagnostics(file: string, text: string): EngramDiagnostic[] {
  const found: EngramDiagnostic[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!GAP_LINE_RE.test(lines[i]!.trim())) continue;
    found.push({
      origin: "engram",
      severity: "error",
      code: ARCHI_GAP_FORBIDDEN_CODE,
      nativeCode: ARCHI_GAP_FORBIDDEN_CODE,
      message: "The design system forbids @dl gap layout hints; remove this line or re-run with --allow-gap.",
      path: `/${i}`,
      subjectRef: file,
    });
  }
  return found;
}

export function checkArchiText(file: string, text: string, allowGap: boolean): ArchiCheckResult {
  const parsed = parseArchiMermaid(text, { subjectRef: file });
  if (!parsed.ok) return { ok: false, file, diagnostics: sortDiagnostics(parsed.diagnostics) };
  const diagnostics: EngramDiagnostic[] = [];
  if (!allowGap) diagnostics.push(...gapDiagnostics(file, text));
  diagnostics.push(...checkArchi(parsed.value.document, { labels: ARCHI_CARDS_CONTENT.labels }, parsed.value.manifest.language));
  return { ok: diagnostics.length === 0, file, diagnostics: sortDiagnostics(diagnostics) };
}

export function formatArchiDiagnosticLine(file: string, diagnostic: EngramDiagnostic): string {
  const path = diagnostic.path ?? "";
  const match = /^\/(\d+)$/.exec(path);
  const loc = match ? String(Number(match[1]) + 1) : path === "" ? "-" : path;
  return `${file}:${loc} ${diagnostic.code} ${diagnostic.message}`;
}

function readArchiFile(file: string): string {
  try {
    return readFileSync(file, "utf-8");
  } catch (err) {
    console.error(`error: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

export async function runArchiCheck(file: string | undefined, opts: { json?: boolean; allowGap?: boolean }): Promise<void> {
  if (!file) { console.error("error: missing <file.mmd> argument"); process.exit(2); }
  const result = checkArchiText(file, readArchiFile(file), opts.allowGap === true);
  if (opts.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const diagnostic of result.diagnostics) console.log(formatArchiDiagnosticLine(file, diagnostic));
    console.log(result.ok ? `${file}: ok` : `${file}: ${result.diagnostics.length} error(s)`);
  }
  if (!result.ok) process.exit(1);
}

export async function runArchiFmt(file: string | undefined, opts: { write?: boolean; check?: boolean }): Promise<void> {
  if (!file) { console.error("error: missing <file.mmd> argument"); process.exit(2); }
  if (opts.write === true && opts.check === true) { console.error("error: --write and --check are mutually exclusive"); process.exit(2); }
  const text = readArchiFile(file);
  const formatted = formatArchiMermaid(text, { subjectRef: file });
  if (!formatted.ok) {
    for (const diagnostic of sortDiagnostics(formatted.diagnostics)) console.error(formatArchiDiagnosticLine(file, diagnostic));
    process.exit(1);
  }
  if (opts.check === true) {
    if (formatted.value !== text) {
      console.log(`${file}: not canonical`);
      process.exit(1);
    }
    console.log(`${file}: canonical`);
    return;
  }
  if (opts.write === true) {
    if (formatted.value !== text) {
      try {
        writeFileSync(file, formatted.value, "utf-8");
      } catch (err) {
        console.error(`error: cannot write ${file}: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(2);
      }
    }
    console.log(`${file}: formatted`);
    return;
  }
  process.stdout.write(formatted.value);
}
