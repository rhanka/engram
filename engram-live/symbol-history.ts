// G2 neutral, bounded endpoint correspondence producer. R1 supplies an
// authorized read-only object view; L5 supplies operation-held inventories.
// No filesystem, Git subprocess, cache, history engine or checkout fallback.
import { createHash } from "node:crypto";
import { ANALYSIS_EXTRACTOR_VERSION } from "./analysis-cache.js";
import { readSymbolInventory, type DeclarationInventoryReceipt } from "./code-analysis.js";
import { ComparisonError, verifyGitObject, type ComparisonObjectsPort } from "./comparisons.js";
import { POLICY_VERSION, validateLiveScope, validateQualifiedOid, validateRetentionReceipt,
  type QualifiedOid, type RetentionReceiptDto, type SymbolCorrespondenceDto, type SymbolHistoryAnchorDto,
  type SymbolHistoryGapCause, type SymbolHistoryOutcomeDto, type SymbolHistoryRequestDto } from "./contracts.js";

export const SYMBOL_HISTORY_VERSION = "live-symbol-history/1";
export const SYMBOL_HISTORY_OPTIONS = Object.freeze({ version: "exact-l5-body/1" as const,
  renameThreshold: 100 as const, moveThreshold: 100 as const, copyThreshold: 100 as const });
/** Per operation, across both endpoints. Exceeding a bound is partial,
 * never a truncated successful history or an implicit total-history cap. */
export const SYMBOL_HISTORY_LIMITS = Object.freeze({ objects: 1024, bytes: 16 * 1024 * 1024, symbols: 4096 });
export interface SymbolHistoryPorts {
  /** Revalidate scope and every path before reading and before emission.
   * Throws deny. The host enforces exclusions in the entire retained view. */
  authorize(request: SymbolHistoryRequestDto, origin?: { readonly commit: QualifiedOid; readonly path: Uint8Array }):
    Promise<"authorized" | "unauthorized" | "excluded">;
  /** Exact endpoint receipt, already scoped by R1. No live worktree or
   * observed-object alternates, acquisition or lazy network fetch. */
  openRetained(request: SymbolHistoryRequestDto, endpoint: QualifiedOid): Promise<{
    readonly receipt: RetentionReceiptDto; readonly objects: ComparisonObjectsPort;
  } | null>;
  /** Host reuses L5, including its grammar/coverage gates, over these exact
   * retained bytes. No substitute regex parser lives in this producer. */
  inventory(input: { readonly scope: SymbolHistoryRequestDto["scope"]; readonly generationId: string;
    readonly commit: QualifiedOid; readonly tree: QualifiedOid; readonly blob: QualifiedOid; readonly path: Uint8Array }):
    Promise<DeclarationInventoryReceipt | null>;
}
class HistoryGap extends Error {
  constructor(readonly cause: SymbolHistoryGapCause, message: string) { super(message); }
}
function gap(cause: SymbolHistoryGapCause, reason: string): never { throw new HistoryGap(cause, reason); }
function pin(input: SymbolHistoryRequestDto): SymbolHistoryRequestDto {
  if (!input || !validateLiveScope(input.scope).ok || input.scope.worktree !== undefined ||
      !validateQualifiedOid(input.before).ok || !validateQualifiedOid(input.after).ok ||
      input.before.algorithm !== input.after.algorithm || input.policyVersion !== POLICY_VERSION ||
      typeof input.generationId !== "string" || !input.generationId.trim() || !input.options ||
      Object.entries(SYMBOL_HISTORY_OPTIONS).some(([key, value]) => input.options[key as keyof typeof SYMBOL_HISTORY_OPTIONS] !== value)) {
    throw new Error("symbol history requires scoped pinned endpoints, generation and supported versioned thresholds");
  }
  return { scope: { tenant: input.scope.tenant, clone: input.scope.clone }, generationId: input.generationId,
    before: { ...input.before }, after: { ...input.after }, policyVersion: input.policyVersion, options: { ...SYMBOL_HISTORY_OPTIONS } };
}

export async function correspondSymbols(input: SymbolHistoryRequestDto, ports: SymbolHistoryPorts): Promise<SymbolHistoryOutcomeDto> {
  const request = pin(input); // Before the first await; ports receive fresh copies.
  const base = () => ({ ...pin(request), calculationVersion: SYMBOL_HISTORY_VERSION, extractorVersion: ANALYSIS_EXTRACTOR_VERSION });
  let objectCount = 0, byteCount = 0, symbolCount = 0;
  const origins: { commit: QualifiedOid; path: Uint8Array }[] = [];
  const authorize = async (origin?: { commit: QualifiedOid; path: Uint8Array }) => {
    let decision: string;
    try { decision = await ports.authorize(pin(request), origin && { commit: { ...origin.commit }, path: Uint8Array.from(origin.path) }); }
    catch { return gap("unauthorized", "symbol correspondence authorization unavailable"); }
    if (decision !== "authorized") gap(decision === "excluded" ? "excluded" : "unauthorized", "symbol correspondence scope or path denied");
  };
  const endpoint = async (commit: QualifiedOid) => {
    let retained: Awaited<ReturnType<SymbolHistoryPorts["openRetained"]>>;
    try { retained = await ports.openRetained(pin(request), { ...commit }); }
    catch { return gap("missing-retention", "authorized R1 endpoint unavailable"); }
    const receipt = retained?.receipt;
    if (!retained || !receipt || !validateRetentionReceipt(receipt).ok || receipt.scope.worktree !== undefined ||
        receipt.scope.tenant !== request.scope.tenant || receipt.scope.clone !== request.scope.clone ||
        receipt.algorithm !== commit.algorithm || receipt.oid !== commit.oid) {
      return gap("missing-retention", "exact endpoint lacks its scoped R1 receipt");
    }
    const objects: ComparisonObjectsPort = { loadBlob: async () => null, async loadObject(oid) {
      if (++objectCount > SYMBOL_HISTORY_LIMITS.objects) gap("bounds-exceeded", "retained object count exceeds the versioned operation bound");
      let object: Awaited<ReturnType<NonNullable<ComparisonObjectsPort["loadObject"]>>>;
      try { object = await retained.objects.loadObject?.(oid) ?? null; }
      catch { return gap("missing-object", "required retained object unavailable; no acquisition or checkout fallback"); }
      if (object) {
        byteCount += object.body.byteLength;
        if (byteCount > SYMBOL_HISTORY_LIMITS.bytes) gap("bounds-exceeded", "retained bytes exceed the versioned operation bound");
      }
      return object ?? null;
    } };
    const qualified = (oid: string): QualifiedOid => ({ algorithm: commit.algorithm, oid });
    const parsed = (await verifyGitObject(commit, objects, "commit")).commit!;
    const tree = qualified(parsed.tree);
    const symbols: SymbolHistoryAnchorDto[] = [];
    const pending = [{ tree, path: Buffer.alloc(0) }];
    while (pending.length) {
      const directory = pending.pop()!;
      const entries = (await verifyGitObject(directory.tree, objects, "tree")).entries!;
      for (const entry of entries) {
        // verifyGitObject's names are reversible latin1 Git path bytes.
        const path = Buffer.concat([directory.path, Buffer.from(entry.name, "latin1")]);
        if (entry.mode === "40000") { pending.push({ tree: entry.oid, path: Buffer.concat([path, Buffer.from("/")]) }); continue; }
        if (entry.mode !== "100644" && entry.mode !== "100755") gap("unsupported-entry", "complete symbol inventory excludes symlinks and gitlinks");
        const origin = { commit: { ...commit }, path: Uint8Array.from(path) };
        await authorize(origin); origins.push(origin);
        const textPath = path.toString("utf8");
        if (!Buffer.from(textPath).equals(path)) gap("path-unavailable", "L5 inventory cannot bind this non-UTF-8 path");
        const blob = await verifyGitObject(entry.oid, objects, "blob");
        let receipt: DeclarationInventoryReceipt | null;
        try { receipt = await ports.inventory({ scope: { ...request.scope }, generationId: request.generationId,
          commit: { ...commit }, tree: { ...tree }, blob: { ...entry.oid }, path: Uint8Array.from(path) }); }
        catch { return gap("inventory-unavailable", "complete L5 declaration inventory unavailable"); }
        const inventory = receipt && readSymbolInventory(receipt);
        const contentHash = createHash("sha256").update(blob.body).digest("hex");
        if (!inventory || inventory.scope.tenant !== request.scope.tenant || inventory.scope.clone !== request.scope.clone ||
            inventory.treeOid !== tree.oid || inventory.path !== textPath || inventory.contentHash !== contentHash) {
          return gap("inventory-unavailable", "operation-held L5 inventory does not bind the retained tree/path/blob/scope");
        }
        const slots = new Set<string>(), ids = new Set<string>();
        for (const symbol of inventory.symbols) {
          if (++symbolCount > SYMBOL_HISTORY_LIMITS.symbols) gap("bounds-exceeded", "symbol inventory exceeds the versioned operation bound");
          if (symbol.treeOid !== tree.oid || symbol.path !== textPath || symbol.contentHash !== contentHash ||
              !/^[0-9a-f]{64}$/.test(symbol.bodyHash) || slots.has(symbol.slot) || ids.has(symbol.id)) {
            return gap("invalid-evidence", "L5 symbol context, body fingerprint or unique version-local slot is invalid");
          }
          slots.add(symbol.slot); ids.add(symbol.id);
          symbols.push({ commit: { ...commit }, tree: { ...tree }, blob: { ...entry.oid }, path: Uint8Array.from(path),
            symbolId: symbol.id, slot: symbol.slot, name: symbol.name, kind: symbol.kind,
            language: inventory.language, bodyHash: symbol.bodyHash, range: null });
        }
      }
    }
    return { symbols, parentEvidence: { commit: { ...commit }, parents: parsed.parents.map(qualified) } };
  };
  try {
    await authorize();
    const before = await endpoint(request.before), after = await endpoint(request.after);
    // Group the full inventories, not a greedy best-match pass. Even an
    // unchanged name/path cannot break a split/copy/merge/duplicate tie.
    const groups = new Map<string, { before: SymbolHistoryAnchorDto[]; after: SymbolHistoryAnchorDto[] }>();
    for (const side of ["before", "after"] as const) for (const symbol of (side === "before" ? before : after).symbols) {
      const key = JSON.stringify([symbol.language, symbol.kind, symbol.bodyHash]);
      const group = groups.get(key) ?? { before: [], after: [] };
      group[side].push(symbol); groups.set(key, group);
    }
    const correspondences: SymbolCorrespondenceDto[] = [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, group]) => {
      const left = group.before.length, right = group.after.length;
      if (left !== 1 || right !== 1) return { ...group, relation: "ambiguous", similarity: left && right ? 100 : null,
        reason: !left || !right ? "missing" : left > 1 && right > 1 ? "duplicate" : left > 1 ? "merge" : "split-or-copy" };
      const a = group.before[0]!, b = group.after[0]!;
      const moved = !Buffer.from(a.path).equals(Buffer.from(b.path)), renamed = a.name !== b.name;
      return { ...group, relation: moved && renamed ? "renamed-and-moved" : moved ? "moved" : renamed ? "renamed" : "unchanged",
        reason: "unique-exact-body", similarity: 100 };
    });
    await authorize();
    for (const origin of origins) await authorize(origin);
    return { ...base(), state: "complete", correspondences, parentEvidence: [before.parentEvidence, after.parentEvidence],
      coverage: { axis: "symbol-correspondence", state: "current", gaps: [] } };
  } catch (error) {
    if (!(error instanceof HistoryGap) && !(error instanceof ComparisonError)) throw error;
    const cause: SymbolHistoryGapCause = error instanceof HistoryGap ? error.cause
      : error.message.startsWith("object-missing:") ? "missing-object" : "invalid-evidence";
    return { ...base(), state: "partial", correspondences: [], parentEvidence: [],
      coverage: { axis: "symbol-correspondence", state: "partial", gaps: [{ cause,
        reason: error instanceof HistoryGap ? error.message : "required retained object missing or invalid" }] } };
  }
}
