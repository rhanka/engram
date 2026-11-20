/** `engram archi check|fmt` end-to-end: strict-by-default engram.archi-mermaid/1 gate. */
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { formatArchiMermaid } from "../src/archi-mermaid/index.js";
import { formatArchiDiagnosticLine } from "../src/archi-cli.js";
import { main } from "../src/cli.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) try { rmSync(tempDirs.pop()!, { recursive: true, force: true }); } catch { /* ignore */ }
});
const tempDir = (): string => { const d = mkdtempSync(join(tmpdir(), "engram-archi-cli-")); tempDirs.push(d); return d; };

async function runCli(args: string[], cwd: string) {
  const prevArgv = process.argv, prevCwd = process.cwd();
  const origLog = console.log, origErr = console.error, origExit = process.exit;
  const origOut = process.stdout.write.bind(process.stdout), origStderr = process.stderr.write.bind(process.stderr);
  let stdout = "", stderr = "";
  const str = (c: string | Uint8Array) => (typeof c === "string" ? c : Buffer.from(c).toString("utf-8"));
  console.log = (...items: unknown[]) => { stdout += `${items.join(" ")}\n`; };
  console.error = (...items: unknown[]) => { stderr += `${items.join(" ")}\n`; };
  process.stdout.write = ((c: string | Uint8Array) => { stdout += str(c); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((c: string | Uint8Array) => { stderr += str(c); return true; }) as typeof process.stderr.write;
  process.exit = ((code?: string | number | null) => { throw new Error(`process.exit ${code ?? 0}`); }) as typeof process.exit;
  process.argv = ["node", "engram", ...args];
  process.chdir(cwd);
  try {
    await main();
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/^process\.exit (\d+)/);
    return match ? { stdout, stderr, exitCode: Number(match[1]) } : { stdout, stderr: `${stderr}${message}\n`, exitCode: 1 };
  } finally {
    process.chdir(prevCwd); process.argv = prevArgv;
    console.log = origLog; console.error = origErr; process.exit = origExit;
    process.stdout.write = origOut; process.stderr.write = origStderr;
  }
}

const fixture = () => resolve(process.cwd(), "tests/fixtures/archi/hosts-r3/architecture.mmd");
const fixtureText = () => readFileSync(fixture(), "utf-8");
const writeTemp = (name: string, text: string): string => { const f = join(tempDir(), name); writeFileSync(f, text, "utf-8"); return f; };
const withViewLines = (text: string, extra: string[]): string => {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.startsWith("%% @dl view "));
  expect(idx).toBeGreaterThanOrEqual(0);
  lines.splice(idx + 1, 0, ...extra);
  return lines.join("\n");
};
const withGapLine = (text: string, line = "%% @dl gap card-x 8"): string => withViewLines(text, [line]);
const withoutEntityHead = (text: string): string => {
  const lines = text.split("\n");
  lines.splice(lines.findIndex((l) => l.startsWith("%% @dl entity ")), 1);
  return lines.join("\n");
};
const withBadVerb = (text: string): string => {
  const next = text.replace('e_art_track_report -->|"documente"| e_rt_track', 'e_art_track_report -->|"wrong verb"| e_rt_track');
  expect(next).not.toBe(text);
  return next;
};
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("engram archi check", () => {
  it("accepts the hosts-r3 fixture, --json gives ok:true", async () => {
    const plain = await runCli(["archi", "check", fixture()], tempDir());
    expect(plain.exitCode).toBe(0);
    expect(plain.stdout).toContain(`${fixture()}: ok`);
    const res = await runCli(["archi", "check", fixture(), "--json"], tempDir());
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ ok: true, file: fixture(), diagnostics: [] });
  });

  it("rejects an entity line without its head with text and --json diagnostics", async () => {
    const file = writeTemp("broken.mmd", withoutEntityHead(fixtureText()));
    const text = await runCli(["archi", "check", file], tempDir());
    expect(text.exitCode).toBe(1);
    expect(text.stdout).toMatch(new RegExp(`${escRe(file)}:\\d+ mermaid-strict-invalid `));
    expect(text.stdout).toContain(`${file}: 1 error(s)`);
    const res = await runCli(["archi", "check", file, "--json"], tempDir());
    expect(res.exitCode).toBe(1);
    const body = JSON.parse(res.stdout) as { ok: boolean; diagnostics: Array<{ code: string }> };
    expect(body.ok).toBe(false);
    expect(body.diagnostics[0]?.code).toBe("mermaid-strict-invalid");
  });

  it("rejects @dl gap by default (including spaced/indented), accepts with --allow-gap", async () => {
    const file = writeTemp("gap.mmd", withGapLine(fixtureText(), "  %%  @dl  gap card-x 8"));
    const dir = tempDir();
    const strict = await runCli(["archi", "check", file, "--json"], dir);
    expect(strict.exitCode).toBe(1);
    const body = JSON.parse(strict.stdout) as { diagnostics: Array<{ code: string; message: string }> };
    expect(body.diagnostics.find((d) => d.code === "archi-gap-forbidden")?.message).toMatch(/design system/i);
    expect((await runCli(["archi", "check", file, "--allow-gap"], dir)).exitCode).toBe(0);
  });

  it("ignores gap inside quoted labels and other directives without --allow-gap", async () => {
    const benign = withViewLines(
      fixtureText()
        .replace('e_act_anthropic["Anthropic"]', 'e_act_anthropic["Anthropic gap"]')
        .replace('%% @dl role "Mémoire gouvernée du track"', '%% @dl role "%% @dl gap card-x 8"'),
      ["%% @dl group g1 rows gap-after 8", "%% @dl item g1 e_rt_agy"],
    );
    const file = writeTemp("benign-gap.mmd", benign);
    const res = await runCli(["archi", "check", file, "--json"], tempDir());
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ ok: true, file, diagnostics: [] });
  });

  it("reports checkArchi semantic errors on parseable files", async () => {
    const file = writeTemp("bad-verb.mmd", withBadVerb(fixtureText()));
    const json = await runCli(["archi", "check", file, "--json"], tempDir());
    expect(json.exitCode).toBe(1);
    const body = JSON.parse(json.stdout) as { ok: boolean; diagnostics: Array<{ code: string }> };
    expect(body.ok).toBe(false);
    expect(body.diagnostics.some((d) => d.code === "archi-edge-verb")).toBe(true);
    const text = await runCli(["archi", "check", file], tempDir());
    expect(text.exitCode).toBe(1);
    expect(text.stdout).toContain(`${file}:/relations/relation:dc-report archi-edge-verb `);
  });

  it("sorts mixed gap and checkArchi diagnostics", async () => {
    const file = writeTemp("mixed.mmd", withGapLine(withBadVerb(fixtureText())));
    const res = await runCli(["archi", "check", file, "--json"], tempDir());
    expect(res.exitCode).toBe(1);
    const body = JSON.parse(res.stdout) as { diagnostics: Array<{ code: string }> };
    expect(body.diagnostics.map((d) => d.code)).toEqual(["archi-edge-verb", "archi-gap-forbidden"]);
  });

  it("formats missing-line diagnostic locators without :undefined", () => {
    const line = formatArchiDiagnosticLine("a.mmd", {
      origin: "engram", severity: "error", code: "archi-input-invalid",
      nativeCode: "archi-input-invalid", message: "bad", subjectRef: "a.mmd",
    });
    expect(line).toBe("a.mmd:- archi-input-invalid bad");
    expect(line).not.toContain(":undefined");
  });

  it("exits 2 on missing files and Commander usage errors", async () => {
    const dir = tempDir();
    const missing = join(dir, "nope.mmd");
    for (const argv of [
      ["archi", "check", missing], ["archi", "fmt", missing],
      ["archi", "check"], ["archi", "fmt"],
      ["archi", "check", fixture(), "--bogus"], ["archi", "fmt", fixture(), "--bogus"],
      ["archi", "check", fixture(), fixture()], ["archi"], ["archi", "bogus"],
    ]) expect((await runCli(argv, dir)).exitCode, argv.join(" ")).toBe(2);
  });

  it("describes the archi group as engram.archi-mermaid/1 files", async () => {
    const dir = tempDir();
    const help = await runCli(["archi", "--help"], dir);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("Validate and format engram.archi-mermaid/1 files");
    expect((await runCli(["archi", "check", "--help"], dir)).exitCode).toBe(0);
    expect((await runCli(["archi", "fmt", "--help"], dir)).exitCode).toBe(0);
  });
});

describe("engram archi fmt", () => {
  it("--check passes on canonical input, fails on padded input", async () => {
    expect((await runCli(["archi", "fmt", fixture(), "--check"], tempDir())).exitCode).toBe(0);
    const padded = writeTemp("padded.mmd", `${fixtureText()}\n\n`);
    expect((await runCli(["archi", "fmt", padded, "--check"], tempDir())).exitCode).toBe(1);
  });

  it("writes exact canonical bytes to stdout, passes --check, is idempotent, and --write normalizes", async () => {
    const dir = tempDir();
    const paddedText = `${fixtureText()}\n\n`;
    const padded = writeTemp("padded.mmd", paddedText);
    const expected = formatArchiMermaid(paddedText);
    expect(expected.ok).toBe(true);
    if (!expected.ok) throw new Error("expected canonical output");
    const first = await runCli(["archi", "fmt", padded], dir);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe(expected.value);
    const emitted = writeTemp("emitted.mmd", first.stdout);
    expect((await runCli(["archi", "fmt", emitted, "--check"], dir)).exitCode).toBe(0);
    const second = await runCli(["archi", "fmt", emitted], dir);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect((await runCli(["archi", "fmt", padded, "--write"], dir)).exitCode).toBe(0);
    expect(readFileSync(padded, "utf-8")).toBe(expected.value);
    expect((await runCli(["archi", "fmt", padded, "--check"], dir)).exitCode).toBe(0);
  });

  it("exits 2 on --write IO errors (read-only path and missing directory)", async () => {
    const dir = tempDir();
    const ro = writeTemp("ro.mmd", `${fixtureText()}\n\n`);
    chmodSync(ro, 0o444);
    try {
      const res = await runCli(["archi", "fmt", ro, "--write"], dir);
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toMatch(/cannot write/i);
    } finally { chmodSync(ro, 0o644); }
    expect((await runCli(["archi", "fmt", join(dir, "missing-dir", "out.mmd"), "--write"], dir)).exitCode).toBe(2);
    expect((await runCli(["archi", "fmt", fixture(), "--write", "--check"], dir)).exitCode).toBe(2);
  });

  it("exits 1 with text diagnostics on unparsable, empty, and CRLF inputs", async () => {
    const dir = tempDir();
    const broken = writeTemp("broken.mmd", withoutEntityHead(fixtureText()));
    const brokenFmt = await runCli(["archi", "fmt", broken], dir);
    expect(brokenFmt.exitCode).toBe(1);
    expect(brokenFmt.stdout).toBe("");
    expect(brokenFmt.stderr).toMatch(new RegExp(`${escRe(broken)}:\\d+ mermaid-strict-invalid `));
    const empty = writeTemp("empty.mmd", "");
    expect((await runCli(["archi", "check", empty], dir)).stdout).toContain(`${empty}:1 mermaid-strict-invalid `);
    const emptyFmt = await runCli(["archi", "fmt", empty], dir);
    expect([emptyFmt.exitCode, emptyFmt.stderr]).toEqual([1, expect.stringContaining(`${empty}:1 mermaid-strict-invalid `)]);
    const crlf = writeTemp("crlf.mmd", fixtureText().replace(/\n/g, "\r\n"));
    expect((await runCli(["archi", "check", crlf], dir)).exitCode).toBe(1);
    const crlfFmt = await runCli(["archi", "fmt", crlf], dir);
    expect(crlfFmt.exitCode).toBe(1);
    expect(crlfFmt.stderr).toContain(`${crlf}:1 mermaid-strict-invalid `);
  });
});
