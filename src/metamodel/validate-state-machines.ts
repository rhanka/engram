import { isRecord } from "../profile-validate.js";
import {
  addError,
  hasUniqueStrings,
  isNonEmptyString,
  isStringArray,
  RANK_KEY_RE,
  rejectUnknownKeys,
  VALID_ADMISSION_MODES,
  VALID_AUTHORITIES,
  type ValidationSink,
} from "./validate-common.js";

const STATE_MACHINE_KEYS: ReadonlySet<string> = new Set(["states", "initial_state", "terminal_states", "transitions"]);
const STATE_TRANSITION_KEYS: ReadonlySet<string> = new Set(["from", "to", "requires", "authority"]);
const HARDENING_KEYS: ReadonlySet<string> = new Set([
  "statuses",
  "default_status",
  "promotion_requires",
  "status_transitions",
]);
const HARDENING_TRANSITION_KEYS: ReadonlySet<string> = new Set([
  "from",
  "to",
  "from_statuses",
  "to_statuses",
  "requires",
  "authority",
]);

function validateTransitionsAndBuildGraph(
  rawTransitions: readonly unknown[],
  stateSet: ReadonlySet<string>,
  path: string,
  sink: ValidationSink,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const state of stateSet) adjacency.set(state, new Set());

  rawTransitions.forEach((rawTransition, idx) => {
    const tPath = `${path}.transitions[${idx}]`;
    if (!isRecord(rawTransition)) {
      addError(sink, "MM_STATE_INVALID_MACHINE", tPath, "Transition must be a plain object");
      return;
    }
    rejectUnknownKeys(rawTransition, STATE_TRANSITION_KEYS, "MM_STATE_INVALID_MACHINE", tPath, "transition", sink);
    const fromList = isStringArray(rawTransition.from) ? rawTransition.from : [];
    const toList = isStringArray(rawTransition.to) ? rawTransition.to : [];
    if (fromList.length === 0) {
      addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.from`, "Transition requires a non-empty from array");
    }
    if (toList.length === 0) {
      addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.to`, "Transition requires a non-empty to array");
    }
    for (const src of fromList) {
      if (!stateSet.has(src)) {
        addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.from`, `Transition from references unknown state ${src}`);
      }
    }
    for (const dst of toList) {
      if (!stateSet.has(dst)) {
        addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.to`, `Transition to references unknown state ${dst}`);
      }
    }
    if (rawTransition.requires !== undefined && !isStringArray(rawTransition.requires)) {
      addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.requires`, "Transition requires must be an array of strings");
    }
    if (
      rawTransition.authority !== undefined &&
      (typeof rawTransition.authority !== "string" || !VALID_AUTHORITIES.has(rawTransition.authority))
    ) {
      addError(
        sink,
        "MM_STATE_INVALID_MACHINE",
        `${tPath}.authority`,
        `Unsupported transition authority ${String(rawTransition.authority)}`,
      );
    }
    for (const src of fromList) {
      const edges = adjacency.get(src);
      if (!edges) continue;
      for (const dst of toList) {
        if (stateSet.has(dst)) edges.add(dst);
      }
    }
  });

  return adjacency;
}

function checkTerminalReachability(
  initialState: string,
  terminalStates: readonly string[],
  stateSet: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  path: string,
  sink: ValidationSink,
): void {
  const reachable = new Set<string>([initialState]);
  const queue: string[] = [initialState];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  for (const terminal of terminalStates) {
    if (stateSet.has(terminal) && !reachable.has(terminal)) {
      addError(
        sink,
        "MM_STATE_INVALID_MACHINE",
        `${path}.terminal_states`,
        `Terminal state ${terminal} is unreachable from initial_state ${initialState}`,
      );
    }
  }
}

export function validateStateMachine(
  rawMachine: unknown,
  path: string,
  sink: ValidationSink,
  collectedStates: Set<string>,
): void {
  if (!isRecord(rawMachine)) {
    addError(sink, "MM_STATE_INVALID_MACHINE", path, "State machine must be a plain object");
    return;
  }
  rejectUnknownKeys(rawMachine, STATE_MACHINE_KEYS, "MM_STATE_INVALID_MACHINE", path, "state_machine", sink);
  if (!isStringArray(rawMachine.states) || rawMachine.states.length === 0) {
    addError(sink, "MM_STATE_INVALID_MACHINE", `${path}.states`, "State machine requires a non-empty states array");
    return;
  }
  if (!hasUniqueStrings(rawMachine.states)) {
    addError(sink, "MM_STATE_INVALID_MACHINE", `${path}.states`, "State machine states must be unique");
    return;
  }

  const stateSet = new Set(rawMachine.states);
  for (const state of rawMachine.states) collectedStates.add(state);

  if (!isNonEmptyString(rawMachine.initial_state) || !stateSet.has(rawMachine.initial_state)) {
    addError(
      sink,
      "MM_STATE_INVALID_MACHINE",
      `${path}.initial_state`,
      "initial_state must be a member of states",
    );
  }

  let terminalStates: string[] = [];
  if (rawMachine.terminal_states !== undefined) {
    if (!isStringArray(rawMachine.terminal_states) || !hasUniqueStrings(rawMachine.terminal_states)) {
      addError(
        sink,
        "MM_STATE_INVALID_MACHINE",
        `${path}.terminal_states`,
        "terminal_states must be an array of unique state names",
      );
    } else {
      terminalStates = rawMachine.terminal_states;
      for (const terminal of terminalStates) {
        if (!stateSet.has(terminal)) {
          addError(
            sink,
            "MM_STATE_INVALID_MACHINE",
            `${path}.terminal_states`,
            `terminal_state ${terminal} is not declared in states`,
          );
        }
      }
    }
  }

  if (!Array.isArray(rawMachine.transitions)) {
    addError(sink, "MM_STATE_INVALID_MACHINE", `${path}.transitions`, "transitions must be an array");
    return;
  }

  const adjacency = validateTransitionsAndBuildGraph(rawMachine.transitions, stateSet, path, sink);

  if (isNonEmptyString(rawMachine.initial_state) && stateSet.has(rawMachine.initial_state) && terminalStates.length > 0) {
    checkTerminalReachability(rawMachine.initial_state, terminalStates, stateSet, adjacency, path, sink);
  }
}

const ADMISSION_POLICY_KEYS: ReadonlySet<string> = new Set([
  "mode",
  "third_party_distinct_from_author",
  "by_rank",
  "by_operation",
  "by_transition",
]);

export function validateAdmissionPolicy(rawPolicy: unknown, path: string, sink: ValidationSink): void {
  if (!isRecord(rawPolicy)) {
    addError(sink, "MM_STATE_INVALID_MACHINE", path, "admission_policy must be a plain object");
    return;
  }
  if (typeof rawPolicy.mode !== "string" || !VALID_ADMISSION_MODES.has(rawPolicy.mode)) {
    addError(
      sink,
      "MM_STATE_INVALID_MACHINE",
      `${path}.mode`,
      `Unsupported admission_policy mode ${String(rawPolicy.mode)}`,
    );
  }

  const checkModeMap = (mapVal: unknown, field: "by_rank" | "by_operation" | "by_transition"): void => {
    if (mapVal === undefined) return;
    if (!isRecord(mapVal)) {
      addError(sink, "MM_STATE_INVALID_MACHINE", `${path}.${field}`, `${field} must be a plain object`);
      return;
    }
    for (const [key, mode] of Object.entries(mapVal)) {
      if (field === "by_rank" && !RANK_KEY_RE.test(key)) {
        addError(sink, "MM_STATE_INVALID_MACHINE", `${path}.by_rank.${key}`, `Invalid rank key ${key}`);
      } else if (!isNonEmptyString(key)) {
        addError(sink, "MM_STATE_INVALID_MACHINE", `${path}.${field}`, `${field} keys must be non-empty strings`);
      }
      if (typeof mode !== "string" || !VALID_ADMISSION_MODES.has(mode)) {
        addError(
          sink,
          "MM_STATE_INVALID_MACHINE",
          `${path}.${field}.${key}`,
          `Unsupported admission mode ${String(mode)}`,
        );
      }
    }
  };

  for (const [key, value] of Object.entries(rawPolicy)) {
    if (!ADMISSION_POLICY_KEYS.has(key)) {
      addError(sink, "MM_STATE_INVALID_MACHINE", `${path}.${key}`, `Unknown admission_policy key ${key}`);
      continue;
    }
    if (key === "third_party_distinct_from_author" && value !== undefined && typeof value !== "boolean") {
      addError(
        sink,
        "MM_STATE_INVALID_MACHINE",
        `${path}.third_party_distinct_from_author`,
        "third_party_distinct_from_author must be a boolean",
      );
    } else if (key === "by_rank" || key === "by_operation" || key === "by_transition") {
      checkModeMap(value, key);
    }
  }
}

function validateHardeningTransition(
  rawTr: unknown,
  tPath: string,
  statusSet: ReadonlySet<string>,
  sink: ValidationSink,
): void {
  if (!isRecord(rawTr)) {
    addError(sink, "MM_STATE_INVALID_MACHINE", tPath, "status_transition must be a plain object");
    return;
  }
  rejectUnknownKeys(rawTr, HARDENING_TRANSITION_KEYS, "MM_STATE_INVALID_MACHINE", tPath, "status_transition", sink);
  const fromRaw = rawTr.from_statuses ?? rawTr.from;
  const toRaw = rawTr.to_statuses ?? rawTr.to;
  const fromList = Array.isArray(fromRaw) ? fromRaw : isNonEmptyString(fromRaw) ? [fromRaw] : [];
  const toList = Array.isArray(toRaw) ? toRaw : isNonEmptyString(toRaw) ? [toRaw] : [];

  if (fromList.length === 0) {
    addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.from`, "Hardening transition requires a non-empty from status list");
  }
  if (toList.length === 0) {
    addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.to`, "Hardening transition requires a non-empty to status list");
  }
  for (const s of fromList) {
    if (typeof s !== "string" || !statusSet.has(s)) {
      addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.from`, `Unknown hardening transition source status ${String(s)}`);
    }
  }
  for (const s of toList) {
    if (typeof s !== "string" || !statusSet.has(s)) {
      addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.to`, `Unknown hardening transition target status ${String(s)}`);
    }
  }
  if (rawTr.requires !== undefined && !isStringArray(rawTr.requires)) {
    addError(sink, "MM_STATE_INVALID_MACHINE", `${tPath}.requires`, "Hardening transition requires must be an array of strings");
  }
  if (
    rawTr.authority !== undefined &&
    (typeof rawTr.authority !== "string" || !VALID_AUTHORITIES.has(rawTr.authority))
  ) {
    addError(
      sink,
      "MM_STATE_INVALID_MACHINE",
      `${tPath}.authority`,
      `Unsupported transition authority ${String(rawTr.authority)}`,
    );
  }
}

export function validateHardening(
  rawHardening: unknown,
  sink: ValidationSink,
  collectedStates: Set<string>,
): void {
  if (rawHardening === undefined) return;
  if (!isRecord(rawHardening)) {
    addError(sink, "MM_STATE_INVALID_MACHINE", "hardening", "hardening must be a plain object");
    return;
  }
  rejectUnknownKeys(rawHardening, HARDENING_KEYS, "MM_STATE_INVALID_MACHINE", "hardening", "hardening", sink);
  if (rawHardening.promotion_requires !== undefined && !isStringArray(rawHardening.promotion_requires)) {
    addError(
      sink,
      "MM_STATE_INVALID_MACHINE",
      "hardening.promotion_requires",
      "hardening.promotion_requires must be an array of non-empty strings",
    );
  }
  if (!isStringArray(rawHardening.statuses) || rawHardening.statuses.length === 0) {
    addError(sink, "MM_STATE_INVALID_MACHINE", "hardening.statuses", "hardening.statuses must be a non-empty array");
    return;
  }
  if (!hasUniqueStrings(rawHardening.statuses)) {
    addError(sink, "MM_STATE_INVALID_MACHINE", "hardening.statuses", "hardening.statuses must not contain duplicates");
  }
  const statusSet = new Set(rawHardening.statuses);
  for (const s of rawHardening.statuses) collectedStates.add(s);

  if (
    rawHardening.default_status !== undefined &&
    (!isNonEmptyString(rawHardening.default_status) || !statusSet.has(rawHardening.default_status))
  ) {
    addError(
      sink,
      "MM_STATE_INVALID_MACHINE",
      "hardening.default_status",
      `hardening.default_status ${String(rawHardening.default_status)} is not in hardening.statuses`,
    );
  }

  if (rawHardening.status_transitions !== undefined) {
    if (!Array.isArray(rawHardening.status_transitions)) {
      addError(
        sink,
        "MM_STATE_INVALID_MACHINE",
        "hardening.status_transitions",
        "hardening.status_transitions must be an array",
      );
      return;
    }
    rawHardening.status_transitions.forEach((rawTr, idx) => {
      validateHardeningTransition(rawTr, `hardening.status_transitions[${idx}]`, statusSet, sink);
    });
  }
}
