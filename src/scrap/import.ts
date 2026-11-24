import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scrapExtractBrowserMessage } from "../llm-mesh-core.js";
import {
  SCRAP_EXTRACT_SCHEMA,
  SCRAP_PACKET_BUDGET,
  fieldsOf,
  loadMission,
  loadPackets,
  packetPrompt,
  parseAnswer,
  repairPrompt,
  type LoadedMission,
  type PacketRow,
  type PacketTexts,
} from "./extract.js";

export function isScrapImportUsageError(e: unknown): boolean {
  return /scrap (import|prompt): /.test(String(e));
}

const asCmdError = (cmd: "prompt" | "import", e: unknown, what: string): Error => {
  if (e instanceof Error && /^scrap (extract|import|prompt): /.test(e.message)) return e;
  return new Error(`scrap ${cmd}: ${what}: ${e instanceof Error ? e.message : String(e)}`);
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
const HEX64 = /^[0-9a-f]{64}$/;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const BROWSER_KEYS = ["id", "attempt", "snapshot_sha256", "prompt_sha256", "model_declared",
  "effort_declared", "transport", "ui", "started_at", "finished_at", "raw_response"];
const ASSIST_KEYS = ["id", "attempt", "snapshot_sha256", "prompt_sha256", "model_declared",
  "effort_declared", "transport", "assistant", "started_at", "finished_at", "raw_response"];
const MODEL_LABEL = /^[a-z0-9]+(-[a-z0-9]+)*-web:[a-z0-9][a-z0-9.-]*-(low|medium|high|xhigh|max)$/;
const ASSIST_MODEL_LABEL =
  /^(claude-code|codex|agy):[a-z0-9][a-z0-9.-]*-(low|medium|high|xhigh|max)$/;
const ASSIST_SURFACES = ["claude-code", "codex", "agy"];
const ASSIST_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const sha256 = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");

export interface BrowserAnswer {
  id: string; attempt: 1 | 2; snapshot_sha256: string[]; prompt_sha256: string;
  model_declared: string; effort_declared: string; transport: "browser";
  ui: { surface: string; temporary_chat: boolean };
  started_at: string; finished_at: string; raw_response: string;
}

export interface AssistantReceiptUsage {
  input_tokens: number; output_tokens: number;
  cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
}

export interface AssistantReceipt {
  served_models: string[];
  usage?: AssistantReceiptUsage;
  cost_usd?: number;
  source: string;
}

export interface AssistantAnswer {
  id: string; attempt: 1 | 2; snapshot_sha256: string[]; prompt_sha256: string;
  model_declared: string; effort_declared: string; transport: "assistant";
  assistant: { surface: string; fresh_context: boolean };
  receipt?: AssistantReceipt;
  started_at: string; finished_at: string; raw_response: string;
}

export type AnswerLine = BrowserAnswer | AssistantAnswer;

type Cmd = "prompt" | "import";
const refusal = (cmd: Cmd, lineNo: number, reason: string): Error =>
  new Error(`scrap ${cmd}: line ${lineNo}: ${reason}`);

const isUtcIso = (s: unknown): s is string => {
  if (typeof s !== "string" || !ISO_Z.test(s)) return false;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return false;
  const frac = `${/\.(\d{1,9})Z$/.exec(s)?.[1] ?? ""}000`;
  return new Date(t).toISOString() === s.replace(/(\.\d{1,9})?Z$/, `.${frac.slice(0, 3)}Z`);
};

const RECEIPT_KEYS = ["served_models", "usage", "cost_usd", "source"];
const RECEIPT_USAGE_KEYS = ["input_tokens", "output_tokens", "cache_read_input_tokens",
  "cache_creation_input_tokens"];

const decodeReceipt = (cmd: Cmd, lineNo: number, r: unknown): AssistantReceipt => {
  if (!isObj(r)) throw refusal(cmd, lineNo, "invalid receipt (requires an object)");
  for (const k of Object.keys(r)) {
    if (!RECEIPT_KEYS.includes(k)) throw refusal(cmd, lineNo, `unknown receipt key ${JSON.stringify(k)}`);
  }
  for (const k of ["served_models", "source"] as const) {
    if (!(k in r)) throw refusal(cmd, lineNo, `missing receipt key ${JSON.stringify(k)}`);
  }
  const served = (r as Record<string, unknown>).served_models;
  if (!Array.isArray(served) || served.length === 0
    || served.some((s) => typeof s !== "string" || (s as string).length === 0)
    || new Set(served as string[]).size !== (served as unknown[]).length) {
    throw refusal(cmd, lineNo,
      "invalid receipt served_models (requires a non-empty array of distinct non-empty strings)");
  }
  let usageOut: AssistantReceiptUsage | undefined;
  if ("usage" in r && (r as Record<string, unknown>).usage !== undefined) {
    const u = (r as Record<string, unknown>).usage;
    if (!isObj(u)) throw refusal(cmd, lineNo, "invalid receipt usage (requires an object)");
    for (const k of Object.keys(u)) {
      if (!RECEIPT_USAGE_KEYS.includes(k)) {
        throw refusal(cmd, lineNo, `unknown receipt usage key ${JSON.stringify(k)}`);
      }
    }
    for (const k of ["input_tokens", "output_tokens"] as const) {
      if (!(k in u)) throw refusal(cmd, lineNo, `missing receipt usage key ${JSON.stringify(k)}`);
    }
    for (const k of RECEIPT_USAGE_KEYS) {
      if (k in u) {
        const n = (u as Record<string, unknown>)[k];
        if (typeof n !== "number" || !Number.isSafeInteger(n) || (n as number) < 0) {
          throw refusal(cmd, lineNo,
            `invalid receipt usage ${k} (requires a non-negative safe integer)`);
        }
      }
    }
    const uu = u as Record<string, unknown>;
    usageOut = {
      input_tokens: uu.input_tokens as number, output_tokens: uu.output_tokens as number,
      ...("cache_read_input_tokens" in uu
        ? { cache_read_input_tokens: uu.cache_read_input_tokens as number } : {}),
      ...("cache_creation_input_tokens" in uu
        ? { cache_creation_input_tokens: uu.cache_creation_input_tokens as number } : {}),
    };
  }
  let costOut: number | undefined;
  if ("cost_usd" in r && (r as Record<string, unknown>).cost_usd !== undefined) {
    const c = (r as Record<string, unknown>).cost_usd;
    if (typeof c !== "number" || !Number.isFinite(c) || (c as number) < 0) {
      throw refusal(cmd, lineNo, "invalid receipt cost_usd (requires a finite number, zero or greater)");
    }
    costOut = c as number;
  }
  const source = (r as Record<string, unknown>).source;
  if (typeof source !== "string" || source.length === 0) {
    throw refusal(cmd, lineNo, "invalid receipt source (requires a non-empty string)");
  }
  return {
    served_models: [...(served as string[])],
    ...(usageOut !== undefined ? { usage: usageOut } : {}),
    ...(costOut !== undefined ? { cost_usd: costOut } : {}),
    source: source as string,
  };
};

export function decodeAnswerLine(cmd: Cmd, text: string, lineNo: number): AnswerLine {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw refusal(cmd, lineNo, `not JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!isObj(v)) throw refusal(cmd, lineNo, "not a JSON object");
  if (v.transport !== "browser" && v.transport !== "assistant") {
    throw refusal(cmd, lineNo, `invalid transport (requires "browser" or "assistant")`);
  }
  const wantKeys = v.transport === "browser" ? BROWSER_KEYS : ASSIST_KEYS;
  if (v.transport === "browser") {
    for (const k of Object.keys(v)) {
      if (!wantKeys.includes(k)) throw refusal(cmd, lineNo, `unknown key ${JSON.stringify(k)}`);
    }
  } else {
    for (const k of Object.keys(v)) {
      if (k !== "receipt" && !wantKeys.includes(k)) {
        throw refusal(cmd, lineNo, `unknown key ${JSON.stringify(k)}`);
      }
    }
  }
  for (const k of wantKeys) {
    if (!(k in v)) throw refusal(cmd, lineNo, `missing key ${JSON.stringify(k)}`);
  }
  if (typeof v.id !== "string" || v.id.length === 0) {
    throw refusal(cmd, lineNo, "invalid id (requires a non-empty string)");
  }
  if (typeof v.attempt !== "number" || !Number.isInteger(v.attempt)) {
    throw refusal(cmd, lineNo, "invalid attempt (requires 1 or 2)");
  }
  if (v.attempt !== 1 && v.attempt !== 2) {
    throw refusal(cmd, lineNo, `unsupported attempt ${v.attempt} (requires 1 or 2)`);
  }
  if (!Array.isArray(v.snapshot_sha256) || v.snapshot_sha256.some((s) => typeof s !== "string" || !HEX64.test(s))) {
    throw refusal(cmd, lineNo, "invalid snapshot_sha256 (requires an array of 64-char lowercase hex)");
  }
  if (typeof v.prompt_sha256 !== "string" || !HEX64.test(v.prompt_sha256)) {
    throw refusal(cmd, lineNo, "invalid prompt_sha256 (requires a 64-char lowercase hex string)");
  }
  for (const k of ["model_declared", "effort_declared"] as const) {
    if (typeof v[k] !== "string" || (v[k] as string).length === 0) {
      throw refusal(cmd, lineNo, `invalid ${k} (requires a non-empty string)`);
    }
  }
  if (v.transport === "browser") {
    if (!isObj(v.ui)) throw refusal(cmd, lineNo, "invalid ui (requires an object)");
    for (const k of Object.keys(v.ui)) {
      if (k !== "surface" && k !== "temporary_chat") {
        throw refusal(cmd, lineNo, `unknown ui key ${JSON.stringify(k)}`);
      }
    }
    if (typeof v.ui.surface !== "string" || v.ui.surface.length === 0) {
      throw refusal(cmd, lineNo, "invalid ui.surface (requires a non-empty string)");
    }
    if (typeof v.ui.temporary_chat !== "boolean") {
      throw refusal(cmd, lineNo, "invalid ui.temporary_chat (requires a boolean)");
    }
    if (v.ui.temporary_chat !== true) {
      throw refusal(cmd, lineNo, "ui.temporary_chat must be true (a chat with history is not a blind annotator)");
    }
  } else {
    if (!isObj(v.assistant)) throw refusal(cmd, lineNo, "invalid assistant (requires an object)");
    for (const k of Object.keys(v.assistant)) {
      if (k !== "surface" && k !== "fresh_context") {
        throw refusal(cmd, lineNo, `unknown assistant key ${JSON.stringify(k)}`);
      }
    }
    if (typeof v.assistant.surface !== "string" || !ASSIST_SURFACES.includes(v.assistant.surface as string)) {
      throw refusal(cmd, lineNo, `invalid assistant.surface (requires "claude-code", "codex" or "agy")`);
    }
    if (typeof v.assistant.fresh_context !== "boolean") {
      throw refusal(cmd, lineNo, "invalid assistant.fresh_context (requires a boolean)");
    }
    if (v.assistant.fresh_context !== true) {
      throw refusal(cmd, lineNo, "assistant.fresh_context must be true (a context with history is not blind)");
    }
    if (typeof v.effort_declared !== "string" || !ASSIST_EFFORTS.includes(v.effort_declared as string)) {
      throw refusal(cmd, lineNo, "invalid effort_declared (requires one of low, medium, high, xhigh, max)");
    }
  }
  if (!isUtcIso(v.started_at)) throw refusal(cmd, lineNo, "invalid started_at (requires ISO 8601 UTC)");
  if (!isUtcIso(v.finished_at)) throw refusal(cmd, lineNo, "invalid finished_at (requires ISO 8601 UTC)");
  if (Date.parse(v.finished_at as string) < Date.parse(v.started_at as string)) {
    throw refusal(cmd, lineNo, "finished_at is before started_at");
  }
  if (typeof v.raw_response !== "string") throw refusal(cmd, lineNo, "invalid raw_response (requires a string)");
  const base = {
    id: v.id, attempt: v.attempt as 1 | 2, snapshot_sha256: [...v.snapshot_sha256] as string[],
    prompt_sha256: v.prompt_sha256 as string,
    model_declared: v.model_declared as string, effort_declared: v.effort_declared as string,
    started_at: v.started_at as string, finished_at: v.finished_at as string,
    raw_response: v.raw_response as string,
  };
  if (v.transport === "browser") {
    const ui = v.ui as Record<string, unknown>;
    return { ...base, transport: "browser", ui: { surface: ui.surface as string, temporary_chat: true } };
  }
  const assistant = v.assistant as Record<string, unknown>;
  const receipt = ("receipt" in v && (v as Record<string, unknown>).receipt !== undefined)
    ? decodeReceipt(cmd, lineNo, (v as Record<string, unknown>).receipt)
    : undefined;
  return {
    ...base, transport: "assistant",
    assistant: { surface: assistant.surface as string, fresh_context: true },
    ...(receipt !== undefined ? { receipt } : {}),
  };
}

export interface ScrapPromptOptions {
  capture: string; mission: string; id: string; repair?: boolean; from?: string;
}
export interface ScrapPromptResult {
  message: string; attempt: 1 | 2; promptSha256: string; snapshotSha256: string[]; missionDigest: string;
}

const hasLoneSurrogate = (s: string): boolean =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

export async function runScrapPrompt(o: ScrapPromptOptions): Promise<ScrapPromptResult> {
  let loaded: LoadedMission;
  try {
    loaded = loadMission(o.mission);
  } catch (e) {
    throw asCmdError("prompt", e, "cannot load mission");
  }
  let packets: Map<string, PacketRow>;
  try {
    packets = loadPackets(o.capture);
  } catch (e) {
    throw asCmdError("prompt", e, "cannot read state.jsonl");
  }
  const packet = packets.get(o.id);
  if (!packet) throw new Error(`scrap prompt: unknown id ${JSON.stringify(o.id)}`);
  if (packet.status !== "ok") {
    throw new Error(`scrap prompt: id ${JSON.stringify(o.id)} latest row is not ok`
      + ` (status ${JSON.stringify(packet.status)})`);
  }
  let built: { texts: PacketTexts[]; prompt: string };
  try {
    const packetCap = loaded.mission.tokenCap ?? SCRAP_PACKET_BUDGET;
    built = packetPrompt(o.capture, packet, loaded.mission, loaded.names, packetCap);
  } catch (e) {
    throw asCmdError("prompt", e, "cannot read snapshot");
  }
  let message = scrapExtractBrowserMessage(SCRAP_EXTRACT_SCHEMA, built.prompt);
  let attempt: 1 | 2 = 1;
  if (o.repair) {
    let rawFile: string;
    try {
      rawFile = readFileSync(o.from!, "utf-8");
    } catch (e) {
      throw asCmdError("prompt", e, "cannot read --from file");
    }
    let prev: string | null = null;
    const fromLines = rawFile.split("\n");
    for (let i = 0; i < fromLines.length; i++) {
      const t = fromLines[i]!;
      if (!t.trim()) continue;
      const decoded = decodeAnswerLine("prompt", t, i + 1);
      if (decoded.id === o.id && decoded.attempt === 1) prev = decoded.raw_response;
    }
    if (prev === null) throw new Error(`scrap prompt: --from has no attempt: 1 line for id ${JSON.stringify(o.id)}`);
    if (!prev.trim()) {
      throw new Error(`scrap prompt: --from latest attempt: 1 answer for id ${JSON.stringify(o.id)} is blank`);
    }
    const outcome = parseAnswer(prev);
    if (outcome.ok) {
      throw new Error(`scrap prompt: --from latest attempt: 1 answer for id ${JSON.stringify(o.id)} parses`);
    }
    message = scrapExtractBrowserMessage(SCRAP_EXTRACT_SCHEMA, repairPrompt(built.prompt, outcome.message, prev));
    attempt = 2;
  }
  if (hasLoneSurrogate(message)) {
    console.error("scrap prompt: warning: budget cut splits a surrogate pair; output writes U+FFFD");
  }
  return {
    message, attempt, promptSha256: sha256(Buffer.from(message, "utf-8")),
    snapshotSha256: (packet.pages ?? []).map((p) => p.sha256), missionDigest: loaded.digest,
  };
}

export interface ScrapImportOptions {
  out: string; capture: string; mission: string; from: string; model: string; retryFailed?: boolean;
}

const rowTail = (label: string, line: AnswerLine): Record<string, unknown> => {
  const receipt = line.transport === "assistant" ? (line as AssistantAnswer).receipt : undefined;
  const mismatch = receipt !== undefined && !receipt.served_models.includes(line.model_declared);
  return {
    transport: line.transport,
    transport_label: label,
    attempt: line.attempt,
    model_declared: line.model_declared,
    effort_declared: line.effort_declared,
    ...(receipt !== undefined ? { receipt } : {}),
    ...(mismatch ? { receipt_mismatch: true } : {}),
    ...(line.transport === "browser"
      ? { ui: { ...line.ui } }
      : { assistant: { ...(line as AssistantAnswer).assistant } }),
    started_at: line.started_at,
    finished_at: line.finished_at,
    prompt_sha256: line.prompt_sha256,
    raw_response_sha256: sha256(line.raw_response),
  };
};

const rowIdentityOf = (rowJson: string): string => {
  const v = JSON.parse(rowJson) as Record<string, unknown>;
  const { receipt: _r, receipt_mismatch: _m, ...rest } = v;
  return JSON.stringify(rest);
};

export async function runScrapImport(o: ScrapImportOptions): Promise<void> {
  if (!o.out || !o.capture || !o.mission || !o.from || !o.model) {
    throw new Error("scrap import: missing flag (--out, --capture, --mission, --from and --model are required)");
  }
  if (existsSync(join(o.out, "state.jsonl"))) {
    throw new Error(`scrap import: run dir ${o.out} contains state.jsonl (import into a run dir without one)`);
  }
  let loaded: LoadedMission;
  try {
    loaded = loadMission(o.mission);
  } catch (e) {
    throw asCmdError("import", e, "cannot load mission");
  }
  let packets: Map<string, PacketRow>;
  try {
    packets = loadPackets(o.capture);
  } catch (e) {
    throw asCmdError("import", e, "cannot read state.jsonl");
  }
  let fromBytes: Buffer;
  try {
    fromBytes = readFileSync(o.from);
  } catch (e) {
    throw asCmdError("import", e, "cannot read --from file");
  }
  const sourceSha256 = sha256(fromBytes);
  const lines: { line: AnswerLine; no: number }[] = [];
  fromBytes.toString("utf-8").split("\n").forEach((t, i) => {
    if (t.trim()) lines.push({ line: decodeAnswerLine("import", t, i + 1), no: i + 1 });
  });
  const fileTransports = new Set(lines.map(({ line }) => line.transport));
  if (fileTransports.size > 1) {
    throw new Error("scrap import: --from file mixes transports \"browser\" and \"assistant\"");
  }
  const fileTransport = lines.length > 0 ? lines[0]!.line.transport : null;
  if (fileTransport === "browser" && !MODEL_LABEL.test(o.model)) {
    throw new Error(`scrap import: invalid --model label ${JSON.stringify(o.model)}`
      + " (expected like gemini-web:carbon-high; never a mesh: alias or provider:model id)");
  }
  if (fileTransport === "assistant" && !ASSIST_MODEL_LABEL.test(o.model)) {
    throw new Error(`scrap import: invalid --model label ${JSON.stringify(o.model)}`
      + " (expected like claude-code:<model>-<effort>; effort is low, medium, high, xhigh or max)");
  }
  if (fileTransport === null) {
    if (!MODEL_LABEL.test(o.model) && !ASSIST_MODEL_LABEL.test(o.model)) {
      throw new Error(`scrap import: invalid --model label ${JSON.stringify(o.model)}`
        + " (expected a browser *-web: label or an assistant claude-code|codex|agy: label)");
    }
  }
  const tail = o.model.slice(o.model.lastIndexOf(":") + 1);
  const prefix = o.model.slice(0, o.model.indexOf(":"));
  for (const { line, no } of lines) {
    if (line.transport === "assistant") {
      const surface = (line as AssistantAnswer).assistant.surface;
      if (prefix !== surface) {
        throw new Error(`scrap import: line ${no}: --model ${JSON.stringify(o.model)}`
          + ` does not match assistant.surface ${JSON.stringify(surface)}`);
      }
    }
    const declared = `${line.model_declared}-${line.effort_declared}`;
    if (declared !== tail) {
      throw new Error(`scrap import: line ${no}: --model ${JSON.stringify(o.model)}`
        + ` does not match ${JSON.stringify(declared)}`);
    }
    const packet = packets.get(line.id);
    if (!packet) throw new Error(`scrap import: line ${no}: unknown id ${JSON.stringify(line.id)}`);
    if (packet.status !== "ok") {
      throw new Error(`scrap import: line ${no}: id ${JSON.stringify(line.id)} latest row is not ok`);
    }
  }
  const resPath = join(o.out, "results.ndjson");
  const existingIdentities = new Set<string>();
  const lastIdentity = new Map<string, string>();
  const lastError = new Map<string, unknown>();
  const existingTransports = new Set<string>();
  if (existsSync(resPath)) {
    for (const t of readFileSync(resPath, "utf-8").split("\n")) {
      if (!t.trim()) continue;
      let v: unknown;
      try {
        v = JSON.parse(t);
      } catch {
        v = null;
      }
      if (!isObj(v) || (v.transport !== "browser" && v.transport !== "assistant")) {
        throw new Error("scrap import: existing results.ndjson has a line without transport"
      + " \"browser\" or \"assistant\"");
      }
      existingTransports.add(v.transport as string);
      if (typeof v.id === "string" && v.type !== "summary") {
        const ident = rowIdentityOf(t);
        existingIdentities.add(ident);
        lastIdentity.set(v.id, ident);
        lastError.set(v.id, (v as Record<string, unknown>).error ?? null);
      }
    }
  }
  if (existingTransports.size > 1) {
    throw new Error("scrap import: existing results.ndjson mixes transports");
  }
  if (existingTransports.size === 1 && fileTransport !== null) {
    const existingTransport = [...existingTransports][0]!;
    if (existingTransport !== fileTransport) {
      throw new Error(`scrap import: run dir ${o.out} contains transport`
        + ` "${existingTransport}" (cannot mix with "${fileTransport}")`);
    }
  }
  const cap = loaded.mission.tokenCap ?? SCRAP_PACKET_BUDGET;
  const computed: string[] = [];
  const computedIdentities: string[] = [];
  const staged: string[] = [];
  const stagedIdentities = new Set<string>();
  const stage = (id: string, rowJson: string, ident: string, err: unknown): void => {
    staged.push(rowJson);
    stagedIdentities.add(ident);
    lastIdentity.set(id, ident);
    lastError.set(id, err ?? null);
  };
  for (let li = 0; li < lines.length; li++) {
    const { line, no } = lines[li]!;
    const packet = packets.get(line.id)!;
    let prev = "";
    let prevIdx = -1;
    if (line.attempt === 2) {
      for (let j = li - 1; j >= 0; j--) {
        if (lines[j]!.line.id === line.id && lines[j]!.line.attempt === 1) {
          prev = lines[j]!.line.raw_response;
          prevIdx = j;
          break;
        }
      }
      if (prevIdx < 0) {
        throw new Error(`scrap import: line ${no}: attempt: 2 with no preceding attempt: 1`
          + ` for id ${JSON.stringify(line.id)}`);
      }
    }
    const wantShas = (packet.pages ?? []).map((p) => p.sha256);
    let error: string | null = null, detail = "";
    if (wantShas.length !== line.snapshot_sha256.length || wantShas.some((s, i) => s !== line.snapshot_sha256[i])) {
      error = "snapshot_mismatch";
      detail = "snapshot_sha256 does not match the capture state row (order-sensitive)";
    }
    let texts: PacketTexts[] = [], promptText = "";
    if (!error) {
      try {
        const built = packetPrompt(o.capture, packet, loaded.mission, loaded.names, cap);
        texts = built.texts;
        promptText = built.prompt;
      } catch {
        error = "write_error";
        detail = "snapshot read failed";
      }
    }
    let message: string | null = null;
    if (!error) {
      if (line.attempt === 1) {
        message = scrapExtractBrowserMessage(SCRAP_EXTRACT_SCHEMA, promptText);
      } else {
        const prevOutcome = parseAnswer(prev);
        const prevErr = prevOutcome.ok ? "" : prevOutcome.message;
        message = scrapExtractBrowserMessage(SCRAP_EXTRACT_SCHEMA, repairPrompt(promptText, prevErr, prev));
      }
    }
    if (!error && message !== null && sha256(Buffer.from(message, "utf-8")) !== line.prompt_sha256) {
      error = "prompt_mismatch";
      detail = "prompt_sha256 does not match the recomputed message";
    }
    let fields: Record<string, unknown> | null = null;
    if (!error) {
      const outcome = parseAnswer(line.raw_response);
      if (!outcome.ok) {
        error = outcome.code;
        detail = outcome.message;
      } else {
        fields = fieldsOf(loaded.specs, outcome.value, texts);
      }
    }
    const rowJson = JSON.stringify(error
      ? { id: line.id, url: packet.url, error, error_detail: detail, fields: null, ...rowTail(o.model, line) }
      : { id: line.id, url: packet.url, fields, ...rowTail(o.model, line) });
    const rowIdent = rowIdentityOf(rowJson);
    const rowErr: unknown = error ?? null;
    computed.push(rowJson);
    computedIdentities.push(rowIdent);
    if (existingIdentities.has(rowIdent)) continue;
    if (line.transport === "assistant" && stagedIdentities.has(rowIdent)) {
      throw new Error(`scrap import: line ${no}: id ${JSON.stringify(line.id)} is already answered`);
    }
    const last = lastIdentity.get(line.id);
    const lastErr = lastError.get(line.id);
    if (line.attempt === 1 && last === undefined) {
      stage(line.id, rowJson, rowIdent, rowErr);
      continue;
    }
    if (line.attempt === 2 && last !== undefined && prevIdx >= 0
      && last === computedIdentities[prevIdx] && lastErr === "parse_error") {
      stage(line.id, rowJson, rowIdent, rowErr);
      continue;
    }
    if (line.attempt === 1 && last !== undefined && o.retryFailed === true && lastErr != null) {
      stage(line.id, rowJson, rowIdent, rowErr);
      continue;
    }
    if (last === undefined || lastErr == null) {
      throw new Error(`scrap import: line ${no}: id ${JSON.stringify(line.id)} is already answered`);
    }
    throw new Error(`scrap import: line ${no}: id ${JSON.stringify(line.id)} last row failed`
      + " (pass --retry-failed for a new attempt: 1; only a parse_error is repaired by attempt: 2)");
  }
  if (staged.length === 0) return;
  let ok = 0, failed = 0;
  for (const s of staged) {
    const r = JSON.parse(s) as { error?: unknown };
    if (r.error == null) ok++;
    else failed++;
  }
  const summaryBase: Record<string, unknown> = {
    type: "summary", transport: fileTransport ?? "browser", transport_label: o.model,
    mission_digest: loaded.digest, ok, failed, attempts_total: staged.length,
    source_sha256: sourceSha256,
  };
  if (fileTransport === "assistant") {
    const parsed = staged.map((s) => JSON.parse(s) as Record<string, unknown>);
    const withReceipt = parsed.filter((r) => isObj(r.receipt));
    if (withReceipt.length > 0) {
      const served = new Set<string>();
      for (const r of withReceipt) {
        for (const m of ((r.receipt as Record<string, unknown>).served_models as string[])) served.add(m);
      }
      summaryBase.receipt_rows = withReceipt.length;
      summaryBase.receipt_mismatches = withReceipt.filter((r) => r.receipt_mismatch === true).length;
      summaryBase.receipt_served_models = [...served].sort();
      const withUsage = withReceipt.filter((r) => isObj((r.receipt as Record<string, unknown>).usage));
      if (withUsage.length > 0) {
        let input = 0, output = 0, cacheRead = 0, cacheCreation = 0;
        let hasRead = false, hasCreation = false;
        for (const r of withUsage) {
          const u = (r.receipt as Record<string, unknown>).usage as Record<string, unknown>;
          input += u.input_tokens as number;
          output += u.output_tokens as number;
          if ("cache_read_input_tokens" in u) {
            hasRead = true;
            cacheRead += u.cache_read_input_tokens as number;
          }
          if ("cache_creation_input_tokens" in u) {
            hasCreation = true;
            cacheCreation += u.cache_creation_input_tokens as number;
          }
        }
        summaryBase.receipt_usage_rows = withUsage.length;
        summaryBase.receipt_usage = {
          input_tokens: input, output_tokens: output,
          ...(hasRead ? { cache_read_input_tokens: cacheRead } : {}),
          ...(hasCreation ? { cache_creation_input_tokens: cacheCreation } : {}),
        };
      }
      const withCost = withReceipt.filter((r) =>
        typeof (r.receipt as Record<string, unknown>).cost_usd === "number");
      if (withCost.length > 0) {
        const sum = withCost.reduce((a, r) =>
          a + ((r.receipt as Record<string, unknown>).cost_usd as number), 0);
        summaryBase.receipt_cost_rows = withCost.length;
        summaryBase.receipt_cost_usd = Number(sum.toFixed(9));
      }
    }
  }
  mkdirSync(o.out, { recursive: true });
  appendFileSync(resPath, `${staged.join("\n")}\n${JSON.stringify(summaryBase)}\n`, "utf-8");
}
