// @sentropic/engram-live/diffs — neutral local diff derivation
// (spec/SPEC_LIVE_GIT_INDEXING.md §8; plan/09 L4b; owner Q2 B).
//
// Pure derivation over caller-supplied entries (the L4a StableCapture feeds
// it in production; tests supply synthetic entries). Staged, unstaged and
// conflict-stage comparisons stay distinct kinds with immutable recorded
// endpoints; binaries, oversized files, filtered paths, protected paths,
// symlinks, gitlinks, deletions and unstable captures become explicit
// exclusions or coverage — never invented text hunks.
//
// Every hunk draft line is screened through the deterministic content
// policy at derivation: a secret line withholds the whole hunk payload,
// allowed lines stay transient open-lines evidence for the injected host
// protection to seal before persistence (see ./snapshots.js).
//
// Neutrality: this module imports ONLY ./contracts.js (data-pure DTOs,
// constants and validators) and ./content-policy.js (deterministic
// screening). No h2a, no cluster-mesh, no sentropic, no storage driver,
// no network, no filesystem, no clock.

import {
  CONTENT_POLICY_VERSION,
  LOCAL_DIFF_NORMALIZER_VERSION,
  LOCAL_MAX_FILE_BYTES,
  validateLiveScope,
  validateLocalDiff,
  validateLocalDiffEndpoint,
  withheldReasonForSecretRule,
  type LiveScope,
  type LocalDiffDto,
  type LocalDiffEndpointDto,
  type LocalExclusionReason,
  type LocalFileChangeDto,
  type LocalHunkDto,
} from "./contracts.js";
import {
  classifyPath,
  containsSecretText,
  matchSecretRule,
  protectedPathRef,
} from "./content-policy.js";

export class DiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffError";
  }
}

/** One caller-supplied entry of a local-diff endpoint inventory. */
export interface LocalEntryInput {
  readonly path: Uint8Array;
  readonly mode: string;
  readonly oid: string;
  readonly stage: number;
  readonly kind: "file" | "symlink" | "gitlink" | "other";
  /** Byte size when known; unknown sizes never bypass the oversized bound. */
  readonly size?: number;
  readonly isBinary?: boolean;
  /** L4a attribute verdict (filtered export/content): caller-supplied, never recomputed here. */
  readonly filtered?: boolean;
  readonly linkTarget?: Uint8Array;
}

/**
 * One conflicted path with its present stage OIDs. Stages are independent
 * facts: an add/add conflict carries no stage 1, so absent stages are null
 * rather than fabricated. At least one stage must be present.
 */
export interface ConflictStageInput {
  readonly path: Uint8Array;
  readonly baseOid?: string | null;
  readonly oursOid?: string | null;
  readonly theirsOid?: string | null;
}

/** One caller-supplied hunk draft with immutable range bounds. */
export interface HunkDraftInput {
  readonly path: Uint8Array;
  readonly startBefore: number;
  readonly countBefore: number;
  readonly startAfter: number;
  readonly countAfter: number;
  readonly lines: readonly string[];
}

export interface DeriveLocalDiffInput {
  readonly scope: LiveScope;
  readonly worktreeId: string;
  readonly kind: "staged" | "unstaged" | "conflict";
  readonly base: LocalDiffEndpointDto;
  readonly tip: LocalDiffEndpointDto;
  readonly baseEntries: readonly LocalEntryInput[];
  readonly tipEntries: readonly LocalEntryInput[];
  readonly conflictStages?: readonly ConflictStageInput[];
  readonly hunkDrafts?: readonly HunkDraftInput[];
  /** False reports an unstable capture: no file facts, explicit coverage. */
  readonly stable?: boolean;
  readonly unstableReason?: string;
  readonly normalizerVersion?: string;
  readonly policyVersion?: string;
  readonly maxFileBytes?: number;
}

function pathKey(path: Uint8Array): string {
  let out = "";
  for (const byte of path) out += String.fromCharCode(byte);
  return out;
}

function copyBytes(path: Uint8Array): Uint8Array {
  return Uint8Array.from(path);
}

/**
 * THE single emitted-path gateway: every path byte sequence published in a
 * derived diff leaves through this function, whatever the exclusion reason
 * (filtered, symlink, gitlink, deleted, binary, oversized, unknown-size,
 * protected). A secret-bearing path becomes a stable opaque reference;
 * allowed paths stay byte-exact copies. No other code emits a raw path.
 */
function emitPathBytes(path: Uint8Array): Uint8Array {
  return classifyPath(path).allowed === false ? protectedPathRef(path) : copyBytes(path);
}

function checkEndpointShape(kind: string, base: LocalDiffEndpointDto, tip: LocalDiffEndpointDto): void {
  const baseChecked = validateLocalDiffEndpoint(base);
  if (!baseChecked.ok) {
    throw new DiffError(`invalid diff base endpoint: ${baseChecked.errors.join("; ")}`);
  }
  const tipChecked = validateLocalDiffEndpoint(tip);
  if (!tipChecked.ok) {
    throw new DiffError(`invalid diff tip endpoint: ${tipChecked.errors.join("; ")}`);
  }
  if (kind === "staged" && (base.label !== "HEAD" || tip.label !== "index")) {
    throw new DiffError('a "staged" diff is HEAD → index only: staged, unstaged and conflict stages never share endpoints');
  }
  if (kind === "unstaged" && (base.label !== "index" || tip.label !== "worktree")) {
    throw new DiffError('an "unstaged" diff is index → worktree only: staged, unstaged and conflict stages never share endpoints');
  }
  if (kind === "conflict" && (base.label !== "index" || tip.label !== "index")) {
    throw new DiffError('a "conflict" diff is index → index with stage 1/2/3 OIDs only');
  }
}

function exclusionOf(entry: LocalEntryInput, maxFileBytes: number): LocalExclusionReason | null {
  if (entry.kind === "gitlink") return "gitlink";
  if (entry.kind === "symlink" || entry.kind === "other") return "symlink";
  if (entry.filtered === true) return "filtered";
  if (classifyPath(entry.path).allowed === false) return "protected";
  if (entry.isBinary === true) return "binary";
  // Insufficient information is explicitly unavailable: an unknown file
  // size can never silently bypass the oversized bound.
  if (entry.kind === "file" && entry.size === undefined) return "unknown-size";
  if (typeof entry.size === "number" && entry.size > maxFileBytes) return "oversized";
  return null;
}

function excludedFile(
  path: Uint8Array,
  status: LocalFileChangeDto["status"],
  oldEntry: LocalEntryInput | null,
  newEntry: LocalEntryInput | null,
  exclusion: LocalExclusionReason,
  stageOids?: Record<string, string>,
): LocalFileChangeDto {
  // Path screening is independent of the exclusion reason: every emitted
  // path leaves through the single gateway, so a secret-bearing path under
  // any exclusion (filtered, symlink, gitlink, deleted, binary, oversized)
  // becomes a stable opaque reference instead of raw bytes.
  const persisted = emitPathBytes(path);
  const file: LocalFileChangeDto = {
    path: persisted,
    previousPath: null,
    status,
    oldMode: oldEntry?.mode ?? "000000",
    newMode: newEntry?.mode ?? "000000",
    oldOid: oldEntry?.oid ?? "0".repeat(40),
    newOid: newEntry?.oid ?? "0".repeat(40),
    added: null,
    deleted: null,
    exclusion,
    hunks: [],
  };
  return stageOids === undefined ? file : { ...file, stageOids: { ...stageOids } };
}

function isHexOidLike(value: unknown): value is string {
  return typeof value === "string" && (/^[0-9a-f]{40}$/.test(value) || /^[0-9a-f]{64}$/.test(value));
}

/** Present conflict stages only: absent stages stay absent, never zero-filled into the fact. */
function presentStageOids(stage: ConflictStageInput): Record<string, string> {
  const out: Record<string, string> = {};
  const slots = [
    ["1", stage.baseOid],
    ["2", stage.oursOid],
    ["3", stage.theirsOid],
  ] as const;
  for (const [number, oid] of slots) {
    if (oid === undefined || oid === null) continue;
    if (!isHexOidLike(oid)) {
      throw new DiffError("a present conflict stage must carry a hex OID");
    }
    out[number] = oid;
  }
  if (Object.keys(out).length === 0) {
    throw new DiffError("a conflicted path carries at least one present stage OID");
  }
  return out;
}

function screenHunk(path: Uint8Array, drafts: readonly HunkDraftInput[]): LocalHunkDto[] {
  const key = pathKey(path);
  const out: LocalHunkDto[] = [];
  for (const draft of drafts) {
    if (pathKey(draft.path) !== key) continue;
    if (!Number.isSafeInteger(draft.startBefore) || draft.startBefore < 0 ||
      !Number.isSafeInteger(draft.countBefore) || draft.countBefore < 0 ||
      !Number.isSafeInteger(draft.startAfter) || draft.startAfter < 0 ||
      !Number.isSafeInteger(draft.countAfter) || draft.countAfter < 0) {
      throw new DiffError("hunk range bounds must be non-negative safe integers (immutable endpoints)");
    }
    const secretLine = draft.lines.find((line) => containsSecretText(line));
    if (secretLine !== undefined) {
      out.push({
        startBefore: draft.startBefore,
        countBefore: draft.countBefore,
        startAfter: draft.startAfter,
        countAfter: draft.countAfter,
        payload: {
          state: "withheld",
          reason: withheldReasonForSecretRule(matchSecretRule(secretLine)),
        },
      });
    } else {
      out.push({
        startBefore: draft.startBefore,
        countBefore: draft.countBefore,
        startAfter: draft.startAfter,
        countAfter: draft.countAfter,
        payload: { state: "open-lines", lines: [...draft.lines] },
      });
    }
  }
  return out;
}

/**
 * Derive one neutral local diff. Pure and total over valid inputs:
 * deterministic ordering by path bytes, immutable endpoint copies, and a
 * final structural validation — an invalid derived diff throws instead of
 * publishing.
 */
export function deriveLocalDiff(input: DeriveLocalDiffInput): LocalDiffDto {
  const scopeChecked = validateLiveScope(input.scope);
  if (!scopeChecked.ok) {
    throw new DiffError(`invalid diff scope: ${scopeChecked.errors.join("; ")}`);
  }
  if (input.kind !== "staged" && input.kind !== "unstaged" && input.kind !== "conflict") {
    throw new DiffError('diff kind must be "staged", "unstaged" or "conflict" (no cumulative HEAD → worktree view validates here)');
  }
  checkEndpointShape(input.kind, input.base, input.tip);
  const normalizerVersion = input.normalizerVersion ?? LOCAL_DIFF_NORMALIZER_VERSION;
  if (normalizerVersion !== LOCAL_DIFF_NORMALIZER_VERSION) {
    throw new DiffError(`diff normalizerVersion must be "${LOCAL_DIFF_NORMALIZER_VERSION}" (normalization is versioned evidence)`);
  }
  const policyVersion = input.policyVersion ?? CONTENT_POLICY_VERSION;
  if (policyVersion !== CONTENT_POLICY_VERSION) {
    throw new DiffError(`diff policyVersion must be "${CONTENT_POLICY_VERSION}"`);
  }
  const maxFileBytes = input.maxFileBytes ?? LOCAL_MAX_FILE_BYTES;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new DiffError("diff maxFileBytes must be a positive safe integer");
  }
  // Immutable snapshot: the caller-owned scope/endpoints/entries may be
  // shared and mutated after derivation; the DTO carries copies only.
  const scope: LiveScope = {
    tenant: input.scope.tenant,
    clone: input.scope.clone,
    ...(input.scope.worktree === undefined ? {} : { worktree: input.scope.worktree }),
  };
  const base: LocalDiffEndpointDto = { label: input.base.label, oid: input.base.oid };
  const tip: LocalDiffEndpointDto = { label: input.tip.label, oid: input.tip.oid };

  if (input.stable === false) {
    // Opaque coverage: the caller-supplied unstable reason is untrusted
    // data and may carry private text, so it never reaches the lot.
    const diff: LocalDiffDto = {
      scope,
      worktreeId: input.worktreeId,
      kind: input.kind,
      base,
      tip,
      comparedParent: null,
      mergeBase: null,
      normalizerVersion,
      policyVersion,
      files: [],
      coverage: {
        axis: input.kind === "staged" ? "index" : "working-tree",
        state: "unavailable",
        reason: "content_unavailable:unstable-capture",
        cause: "unstable-capture",
      },
    };
    const checked = validateLocalDiff(diff);
    if (!checked.ok) {
      throw new DiffError(`derived invalid unstable local diff: ${checked.errors.join("; ")}`);
    }
    return diff;
  }

  const drafts = input.hunkDrafts ?? [];
  const files: LocalFileChangeDto[] = [];
  let conflictCoverage: LocalDiffDto["coverage"];
  if (input.kind === "conflict") {
    // Every conflict step is screened against the endpoint inventories as
    // well as the path policy: binary, oversized, filtered, protected,
    // symlink and gitlink signals from either bound exclude the path.
    // Bijection exacte (L4b M3) : base et pointe sont comparées SÉPARÉMENT
    // à la déclaration. Pour chaque côté, l'ensemble des entrées (chemin,
    // étape, OID) doit être EXACTEMENT égal à l'ensemble déclaré : une
    // entrée en plus, en moins ou divergente d'un seul côté exclut le
    // chemin, même si l'autre côté concorde et masquerait la divergence.
    const inventoryBySide = (
      entries: readonly LocalEntryInput[],
    ): Map<string, LocalEntryInput[]> => {
      const byPath = new Map<string, LocalEntryInput[]>();
      for (const entry of entries) {
        const key = pathKey(entry.path);
        const group = byPath.get(key);
        if (group === undefined) byPath.set(key, [entry]);
        else group.push(entry);
      }
      return byPath;
    };
    const baseByPath = inventoryBySide(input.baseEntries);
    const tipByPath = inventoryBySide(input.tipEntries);
    // Sorted `stage:oid` pairs of one side for one path. Null when the
    // side carries an entry outside conflict stages 1/2/3 for this path:
    // such an entry can never belong to the declared set.
    const sideSteps = (entries: LocalEntryInput[] | undefined): readonly string[] | null => {
      if (entries === undefined) return [];
      const steps: string[] = [];
      for (const candidate of entries) {
        if (candidate.stage !== 1 && candidate.stage !== 2 && candidate.stage !== 3) return null;
        steps.push(`${candidate.stage}:${candidate.oid}`);
      }
      return steps.sort();
    };
    let conflictInventoryMismatch = false;
    const declaredKeys = new Set<string>();
    for (const stage of input.conflictStages ?? []) {
      const stageOids = presentStageOids(stage);
      const stageKey = pathKey(stage.path);
      // Une déclaration dupliquée ne publie jamais deux faits : refus
      // explicite au lieu d'écraser ou de doubler l'inventaire.
      if (declaredKeys.has(stageKey)) {
        throw new DiffError("a conflicted path carries a duplicate declaration: refuse instead of publishing two facts");
      }
      declaredKeys.add(stageKey);
      const declaredSteps = Object.keys(stageOids)
        .sort()
        .map((step) => `${step}:${stageOids[step] as string}`);
      const baseSteps = sideSteps(baseByPath.get(stageKey));
      const tipSteps = sideSteps(tipByPath.get(stageKey));
      let mismatch =
        baseSteps === null ||
        tipSteps === null ||
        baseSteps.length !== declaredSteps.length ||
        tipSteps.length !== declaredSteps.length;
      if (!mismatch && baseSteps !== null && tipSteps !== null) {
        mismatch =
          baseSteps.some((step, index) => step !== declaredSteps[index]) ||
          tipSteps.some((step, index) => step !== declaredSteps[index]);
      }
      let exclusion: LocalExclusionReason | null = null;
      if (mismatch) {
        exclusion = "unknown-size";
        conflictInventoryMismatch = true;
      } else {
        const bothSides = [...(baseByPath.get(stageKey) ?? []), ...(tipByPath.get(stageKey) ?? [])];
        for (const step of Object.keys(stageOids)) {
          const stepEntries = bothSides.filter((candidate) => candidate.stage === Number(step));
          for (const candidate of stepEntries) {
            const signal = exclusionOf(candidate, maxFileBytes);
            if (signal !== null) {
              exclusion = signal;
              break;
            }
          }
          if (exclusion !== null) break;
        }
        if (exclusion === null && classifyPath(stage.path).allowed === false) {
          exclusion = "protected";
        }
      }
      if (exclusion !== null) {
        files.push(excludedFile(stage.path, "conflict", null, null, exclusion, stageOids));
        continue;
      }
      files.push({
        path: emitPathBytes(stage.path),
        previousPath: null,
        status: "conflict",
        oldMode: "100644",
        newMode: "100644",
        oldOid: stage.baseOid ?? "0".repeat(40),
        newOid: stage.oursOid ?? stage.theirsOid ?? "0".repeat(40),
        added: null,
        deleted: null,
        stageOids,
        hunks: screenHunk(stage.path, drafts),
      });
    }
    // Inventory conflict steps with no declared counterpart are explicit
    // exclusions, never silent drops: an omitted conflictStages with a
    // 1/2/3 inventory still publishes one withheld fact per path.
    for (const key of new Set([...baseByPath.keys(), ...tipByPath.keys()])) {
      if (declaredKeys.has(key)) continue;
      const group = [...(baseByPath.get(key) ?? []), ...(tipByPath.get(key) ?? [])];
      const staged = group.filter(
        (candidate) => candidate.stage === 1 || candidate.stage === 2 || candidate.stage === 3,
      );
      if (staged.length === 0) {
        // Étapes hors 1/2/3 (p. ex. stage 4) sans contrepartie déclarée :
        // exclusion explicite, jamais un abandon silencieux.
        conflictInventoryMismatch = true;
        const invalid = group[0] as LocalEntryInput;
        files.push(excludedFile(invalid.path, "conflict", null, null, "unknown-size"));
        continue;
      }
      conflictInventoryMismatch = true;
      const first = staged[0] as LocalEntryInput;
      files.push(excludedFile(first.path, "conflict", null, null, "unknown-size"));
    }
    if (conflictInventoryMismatch) {
      conflictCoverage = {
        axis: "index",
        state: "unavailable",
        reason: "content_unavailable:conflict-inventory-mismatch",
        cause: "policy-withheld",
      };
    }
  } else {
    // Inventories are stage-0 only outside a conflict derivation: unmerged
    // entries and duplicate paths are refused explicitly instead of being
    // crushed by a path-only map.
    const indexEntries = (entries: readonly LocalEntryInput[], side: string): Map<string, LocalEntryInput> => {
      const byPath = new Map<string, LocalEntryInput>();
      for (const entry of entries) {
        if (entry.stage !== 0) {
          throw new DiffError(`${side} inventory carries unmerged index stages: refuse outside a conflict derivation`);
        }
        const key = pathKey(entry.path);
        if (byPath.has(key)) {
          throw new DiffError(`${side} inventory carries a duplicate path: refuse instead of crushing entries`);
        }
        byPath.set(key, entry);
      }
      return byPath;
    };
    const baseByPath = indexEntries(input.baseEntries, "base");
    const tipByPath = indexEntries(input.tipEntries, "tip");
    const ordered = new Set<string>([...baseByPath.keys(), ...tipByPath.keys()]);
    for (const key of [...ordered].sort()) {
      const oldEntry = baseByPath.get(key) ?? null;
      const newEntry = tipByPath.get(key) ?? null;
      const path = (newEntry ?? oldEntry)?.path as Uint8Array;
      // Unchanged entries publish no fact: equal blobs under equal modes
      // are not modifications, even when both bounds are present.
      if (oldEntry !== null && newEntry !== null &&
        oldEntry.oid === newEntry.oid && oldEntry.mode === newEntry.mode &&
        oldEntry.kind === newEntry.kind) {
        continue;
      }
      const status: LocalFileChangeDto["status"] =
        oldEntry === null ? "added" : newEntry === null ? "deleted" : "modified";
      if (status === "deleted") {
        files.push(excludedFile(path, status, oldEntry, null, "deleted"));
        continue;
      }
      // Both bounds are screened: a filtered old bound excludes the file
      // even when the new bound looks allowed, so removed lines never leak.
      const exclusion = newEntry !== null && oldEntry !== null
        ? (exclusionOf(newEntry, maxFileBytes) ?? exclusionOf(oldEntry, maxFileBytes))
        : exclusionOf((newEntry ?? oldEntry) as LocalEntryInput, maxFileBytes);
      if (exclusion !== null) {
        files.push(excludedFile(path, status, oldEntry, newEntry, exclusion));
        continue;
      }
      files.push({
        path: emitPathBytes(path),
        previousPath: null,
        status,
        oldMode: oldEntry?.mode ?? "000000",
        newMode: (newEntry as LocalEntryInput).mode,
        oldOid: oldEntry?.oid ?? "0".repeat(40),
        newOid: (newEntry as LocalEntryInput).oid,
        added: null,
        deleted: null,
        hunks: screenHunk(path, drafts),
      });
    }
  }
  files.sort((left, right) => (pathKey(left.path) < pathKey(right.path) ? -1 : 1));

  const diff: LocalDiffDto = {
    scope,
    worktreeId: input.worktreeId,
    kind: input.kind,
    base,
    tip,
    comparedParent: null,
    mergeBase: null,
    normalizerVersion,
    policyVersion,
    files,
    ...(conflictCoverage === undefined ? {} : { coverage: conflictCoverage }),
  };
  const checked = validateLocalDiff(diff);
  if (!checked.ok) {
    throw new DiffError(`derived invalid local diff: ${checked.errors.join("; ")}`);
  }
  return diff;
}
