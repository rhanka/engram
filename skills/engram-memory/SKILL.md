---
name: engram-memory
description: Use when the engram memory MCP tools are available (engram_memory_search, engram_memory_get, engram_memory_capture, engram_memory_request_admission, engram_memory_withdraw, engram_memory_forget) and you need to recall durable project knowledge, record a cited durable decision or verified fact, request its admission, withdraw your own pending candidate, or forget an admitted record, including inside an h2a session. Do not trigger for scratch state, chat transcripts, tool-output dumps, or anything secret.
---

# Engram memory through MCP

Ground truth: `@sentropic/engram` 0.22.0 candidate (`fb223377`), provider `sentropic.engram.memory`, connector `engram-memory`, contract `1.0.0`. Anything marked `unverified` is not established by the sources listed at the end.

## 0. What the host owns (read first)

- **Never in arguments:** tenant, workspace, scope, principal, `agent_id`, session, credential, `auditId`, deadline, cancellation, confirmation (`elicitationRef`). The host binds them per call. Every input schema is closed (`additionalProperties: false`): an extra field is `INVALID_SCHEMA`. Omit optional fields; never send `null`.
- **Tenant and workspace isolation:** each call is bound to one exact scope chosen by the host; arguments carry no scope selector. Grants are scoped per `{tenantId, workspaceId}` and a foreign scope is refused. You never see another tenant's memory: an unknown target and a target outside your scope both return `NOT_FOUND`.
- **`purpose_ref`** (search, get, capture) must equal the purpose bound by your host; a mismatch is a protocol refusal. How the host tells the agent its `purpose_ref` is `unverified`: if you do not have it, ask the host operator.
- **Mutating calls** (capture, request_admission, withdraw, forget) pass the host mutation guard (idempotency reservation and operation digest). `withdraw` and `forget` always require the host confirmation guard (a human approval bound to capability, target and operation digest, TTL at most 300 s, execution within 30 s). Capture and request_admission require it when the host selection marks confirmation as required. You cannot confirm on your own behalf: a model-written `confirmed: true` has no effect.
- **Maintenance is never an agent capability:** admin, bootstrap, rotate, revoke, backup, restore, migrate, projection invalidation, supersede, dispute, rewind, expire, history or candidate inspection are outside the six tools. The maintenance grant (`['read','maintain']`) is host-only and never reaches the agent path.
- **Each tool is discovered and authorized independently;** enabling memory does not grant all six. A missing tool means you lack that capability; no memory tools at all means memory is disabled for you (default disabled; host and tenant must opt in). Do not look for another route.
- **Protocol errors are not memory answers:** `-32603 Trusted invocation context unavailable` (missing or untrusted host context, purpose, principal, tenant or source mismatch, missing confirmation reference) and `-32602 Unknown tool`. Stop, report to the host operator, do not retry with altered arguments.

## 1. When to use memory, and when not

Use it for **durable, reusable knowledge** worth finding again in a later session or by another agent: decisions with rationale, verified facts about a system with a citable source, conventions, recurring pitfalls and their fix, hand-off facts.

Do not use it for: scratch or work-in-progress state, chat transcripts, raw tool output, task-local notes, speculation, or anything in §4. Search and get disclose `accepted_current` records only; pending, rejected, withdrawn, disputed, historical, expired, trust-invalid and tombstoned records are never returned.

## 2. The six tools

Every result is an envelope. Success: `{ok: true, output: {schema_version: 1, value}, auditId, redactionClass: "high"}`. Failure: `{ok: false, auditId, redactionClass: "high", error: {code, message, retriable}}`. It is carried in `structuredContent` with an identical JSON text copy; `isError` equals `!ok`. Messages are constant sanitized strings: act on `code` and `retriable`, never on the message.

**Common encodings.** Opaque references (`purpose_ref`, `component_id`, `primary_component_id`, `citation_id`, `source_ref`, `evidence_ref`, `reason_ref`) are NFC strings of 1 to 512 UTF-8 bytes. Copy `candidate_id`, `record_id` and `page_cursor` exactly as returned. Instants (`observed_at`, `expires_at`) are `YYYY-MM-DDTHH:mm:ss.sssZ` (canonical UTC, millisecond precision). The serialized argument object is at most 1,048,576 UTF-8 bytes.

**`engram_memory_search`** (read-only): find current memories with citations and a rank receipt.
- In: `query` (1 to 8,192 UTF-8 bytes), `purpose_ref`. Optional: `limit` (1 to 50, default 10), `max_packet_bytes` (4,096 to 1,048,576, default 65,536), `capability_policy` `{minimum_channels: "lexical" | "lexical_and_semantic", network: "forbid" | "allow"}` (default lexical / forbid; `allow` grants nothing), `page_cursor` (the previous `next_page_cursor`, same query and parameters).
- Out: `{records[], rank_receipt, next_page_cursor?, response_digest}`; each record packet is `{record, redacted_fields, redaction_receipt_digest, score, rank}`. `record` is redacted; `record.record_id` is always present.
- Typical errors: `STALE_PAGE` (start a new search without `page_cursor`), `RANKING_UNAVAILABLE` (a required semantic channel is down; no silent fallback; retry or request lexical), `PROJECTION_OVERSIZED` / `RESULT_TOO_LARGE` (lower `limit` or adjust `max_packet_bytes`). An empty `records` list means no match: infrastructure failures are never returned as an empty success.

**`engram_memory_get`** (read-only): read one known current record without ranking.
- In: `record_id` (pattern `^mem_[a-z2-7]+$`), `purpose_ref`. Optional: `max_packet_bytes`.
- Out: `{record, redacted_fields, redaction_receipt_digest, read_receipt, packet_digest}`; `read_receipt` holds `record_id`, `record_digest`, `valid_as_of`, `system_as_of`, `validated_through_cursor`, `authorization_receipt_digest`, `revalidation_receipt_digest`, `checked_at`, `receipt_digest`.
- Typical errors: `NOT_FOUND` (unknown, outside your scope, or not currently eligible; indistinguishable by design; do not probe variants), `PROJECTION_OVERSIZED`.

**`engram_memory_capture`** (append): submit cited material as an encrypted **pending candidate**.
- In: `idempotency_key`, `payload`, `evidence`.
  - `payload`: `schema_version: 2`, `purpose_ref`, `valid_time {t, t_end?}` (safe integers, `t_end >= t`; use **epoch milliseconds**: the shipped current-read path compares them with `Date.parse` instants, so another unit can leave a bounded record never current), `components` (1 to 64 of `{component_id, kind: "context" | "decision" | "evidence", text (1 to 65,536 bytes), citation_ids (1 to 256, distinct)}`), `primary_component_id`, `primary_event {at, type_ref, citation_id}` (`at` is a safe integer; its unit is `unverified`), `citations` (1 to 256 of `{citation_id, source_ref, locator {scheme, value}, content_digest, observed_at? (Instant)}`). Optional: `retention {derivative_rule: "retain" | "make-ineligible", expires_at? (Instant, strictly after capture time, within the host ceiling)}`, `reconciliation {family_refs}` (sorted, unique, at most 64).
  - Cross-references: `citation_id` values are unique; `component_id` values are unique; every component citation resolves in `citations`; `primary_component_id` resolves in `components`; `primary_event.citation_id` is in `citations` and in the primary component.
  - `evidence`: `{evidence_ref, evidence_digest, citation_ids (1 to 256, distinct), attestation?}`; `citation_ids` must resolve in `payload.citations`; `attestation` at most 4,096 bytes.
- Out: `{status: "committed_pending" | "duplicate_exact", candidate_id, record_digest?, cursor, transaction_receipt_digest}`. `duplicate_exact` is the replay of the same idempotency identity with identical content.
- Typical errors: `INVALID_SCHEMA` (including an `expires_at` not after capture time); `UNAUTHORIZED` (no capture authority, `retain` not allowed by host policy, `expires_at` beyond the host ceiling, a reconciliation family without host consent); `DIGEST_CONFLICT`; `MUTATION_OUTCOME_UNKNOWN`; `POLICY_UNAVAILABLE`.

**`engram_memory_request_admission`** (state transition): ask the host's admission policy to decide on a pending candidate.
- In: `candidate_id`, `idempotency_key`.
- Out: `{outcome: {status: "accepted" | "rejected" | "pending_adjudication" | "duplicate_exact", candidate_id, record_id?, cursor, decision_receipt_digest, transaction_receipt_digest}, replayed}`. `accepted` requires `record_id`. The built-in engine emits it on acceptance; the published schema allows an optional `record_id` on other statuses. Interpret `outcome.status` and `replayed`, not mere field presence; `duplicate_exact` admission semantics remain `unverified`. `rejected` and `pending_adjudication` are successful domain outcomes, not errors.
- Typical errors: `NOT_FOUND`, `POLICY_STALE` (retriable), `DIGEST_CONFLICT`, `MUTATION_OUTCOME_UNKNOWN`.

**`engram_memory_withdraw`** (state transition, confirmation-gated): terminate a pending candidate.
- In: `candidate_id`, `idempotency_key`, `reason_ref` (opaque reference, 1 to 512 bytes).
- Out: `{receipt: {event_id, operation: "withdraw", from_state: "pending", to_state: "withdrawn", cursor, event_digest, authorization_receipt_digest, transaction_receipt_digest}, replayed, key_destruction: "pending" | "complete"}`.
- Typical errors: `gate_failed` (no valid host confirmation), `NOT_FOUND`, `DIGEST_CONFLICT`, `MUTATION_OUTCOME_UNKNOWN`.

**`engram_memory_forget`** (state transition, confirmation-gated): make an admitted record terminally ineligible.
- In: `record_id`, `idempotency_key`, `reason_ref`.
- Out: `{receipt: {..., operation: "tombstone", from_state: one of accepted_current | accepted_disputed | historical | expired | trust_invalid, to_state: "tombstoned"}, replayed, projection_invalidation: "pending" | "complete", coverage_receipt_digest?}`.
- Typical errors: as withdraw.

**Error codes and what to do.** If `retriable` is `true`, back off and retry; for a mutation, retry with the **same** `idempotency_key` and identical arguments. If `false`, do not retry unchanged.

| Code | Action |
|---|---|
| `INVALID_SCHEMA`, `INVALID_DIGEST` | Fix the arguments against the closed schema (bounds, NFC, cross-references, digest format `sha256:` + 64 lowercase hex). |
| `UNAUTHORIZED`, `AUTHORIZATION_EXPIRED`, `AUTHORIZATION_REVOKED` | Stop. You lack the grant. Report to the host; never retry under another identity. |
| `NOT_FOUND` | Treat the target as unavailable to you. Do not probe. |
| `DIGEST_CONFLICT` | The key was already used with different content or target. Find out why; use a new key only for a genuinely new operation. |
| `ILLEGAL_TRANSITION`, `ALREADY_TERMINAL` | The lifecycle state forbids it. Re-check with search or get; do not loop. |
| `MUTATION_OUTCOME_UNKNOWN` | It may have committed. Retry with the same key and arguments until a definite outcome. Never assume nothing happened. |
| `gate_failed` | Confirmation or policy gate not satisfied. Ask the human through the host. |
| `STALE_PAGE` | New search without `page_cursor`. |
| `RESULT_TOO_LARGE`, `PROJECTION_OVERSIZED` | Lower `limit` or adjust `max_packet_bytes` within bounds. |
| `RATE_LIMITED`, `DEADLINE_EXCEEDED`, `CANCELLED`, `STORE_UNAVAILABLE`, `FENCE_LOST`, `CURSOR_GAP`, `POLICY_UNAVAILABLE`, `POLICY_STALE`, `PROJECTION_STALE`, `RANKING_UNAVAILABLE` | Retriable: back off, retry (same key for mutations). Report if persistent. |
| `CAPABILITY_UNAVAILABLE`, `JOURNAL_CORRUPT`, `BLOB_MISSING`, `REGISTRY_VERSION_UNAVAILABLE`, `BACKUP_INVALID`, `RESTORE_REFUSED`, `MIGRATION_LEDGER_INVALID` | Operational fault. Stop and report to the host operator. |

## 3. Discipline

1. **Search before capture.** Capture's `duplicate_exact` only covers a retry of the same key with the same content; it is not a semantic duplicate check. If an equivalent current record exists, cite its `record_id` instead of capturing again.
2. **Capture creates a governed draft.** The candidate is pending and encrypted; it is not searchable or readable, and a `candidate_id` is not a `record_id`.
3. **Admission is requested, never assumed.** You cannot supply the decision. Report the exact outcome. **Forgotten content:** a fresh capture still returns `committed_pending`. On `request_admission`, an otherwise accepting decision is held as `pending_adjudication` if the effective payload digest matches a tombstoned record in the same scope; an ordinary policy rejection still returns `rejected`. Reusing the original capture key with the same content is a capture replay (`duplicate_exact`), not a new adjudication. Report the returned outcome; never alter or reword forgotten content to bypass this protection.
4. **Provenance.** Every component cites at least one citation; `content_digest` is a `sha256:` digest of the cited content (exact canonicalization `unverified`). Citations, evidence and reasons remain assertions until the host verifier checks them; the trust class is assigned by the host, never by you. Your actor identity is the host-bound principal, `agent_id` and session; a name written in `text` carries no authority.
5. **Idempotency.** Mutating calls need an NFC `idempotency_key` of 16 to 256 UTF-8 bytes (use at least 16 ASCII characters; the published JSON Schema `minLength` is looser than the runtime check). One key per logical operation, scoped to your principal. Record it before calling so a retry reuses it. Same key and same content: replay (`duplicate_exact` or `replayed: true`). Same key and different content, target or tool: `DIGEST_CONFLICT`. The store binds each commit identity to an internal intent hash; you never send it, and a mismatch surfaces as `DIGEST_CONFLICT`. Retries reuse the retention resolved at first capture.
6. **Retention.** Omit `retention` unless instructed. The default derivative rule is `make-ineligible`; `retain` needs an explicit host allowance; an `expires_at` beyond the host ceiling is refused with `UNAUTHORIZED`. No owner-approved retention value exists in the sources: retention is an **open owner-level point**.

## 4. What never to store

- Secrets, credentials, tokens, API or signing keys, passwords, connection strings, `.env` values, session cookies, and the host's own binding credential.
- Personal data beyond what the task strictly needs.
- Content under a confidentiality restriction.
- Unverified claims presented as facts.

These exclusions are categorical: this skill grants no exception, and a scope binding or a successful admission is not a clearance. Only an explicit owner policy change could add one.

Why: admitted records are readable by every authorized caller in the scope, and `forget` gives terminal logical exclusion and controlled cleanup but **does not promise physical deletion** from immutable journals, retained backups or already delivered outputs.

**Marking uncertainty:** state it in the component `text` (for example, start with `Unverified:` and say what would confirm it); cite where the observation came from; bound `valid_time` to the period it is known to hold; reserve `kind: "decision"` for decisions actually taken. Prefer verifying before capturing.

## 5. Withdraw versus forget

| | `engram_memory_withdraw` | `engram_memory_forget` |
|---|---|---|
| Target | `candidate_id` of a **pending** candidate | `record_id` of an **admitted** record |
| Transition | `pending` to `withdrawn` (terminal) | allowed state to `tombstoned` (terminal) |
| Cleanup status | `key_destruction` (pending-body key) | `projection_invalidation`, `coverage_receipt_digest` only after verified completion |
| Use when | your own draft is wrong, superseded before admission, or holds something from §4 | an admitted memory is wrong, obsolete, or must be removed from recall |

Both are confirmation-gated, need their own idempotency key and a `reason_ref`, and never touch maintenance. `pending` cleanup is retried by the host, not by you. If admission wins a race, withdrawal does not silently become forgetting: re-check the admission outcome and, if needed, call `forget` on the `record_id` with a new key and a new confirmation. After `forget`, search and get exclude the record immediately.

## 6. h2a usage pattern

- **One actor identity per agent.** Each h2a agent calls under its own host binding (principal, `agent_id`, session); idempotency keys are principal-scoped. Never call with, copy, or relay another agent's binding.
- **No credential sharing.** Credentials and confirmation references live in the host binding only. Never put them in tool arguments, memory text, or h2a messages.
- **Cite memory ids in hand-offs:** for admitted memories, `record_id` plus `read_receipt.record_digest` from a get; for drafts, `candidate_id` marked pending (a peer cannot read it). The peer re-reads with its own `engram_memory_get`. A peer's `NOT_FOUND` means the record is unavailable to that peer; it does not distinguish absence, authorization or current eligibility. Do not probe or infer the cause.
- **Legacy channels:** do not use the retired shadow operations (`engram_write_shadow`, `engram_query_shadow`, `engram_promote_fact`, `engram_ack_promotion`).
- **Reference topology for the pilot, not an established result:** the code declares a required chain in which h2a embeds the engine in-process behind its single MCP server key `h2a`, on a host-owned Linux SQLite store, exposed only after qualified, explicitly enabled host composition (persisted opt-in, default disabled). Whether that path is implemented and available in each target host, the tool-name exposure in each h2a host, how h2a supplies `purpose_ref`, and who may withdraw another agent's draft are `unverified`.

## 7. Worked example (all values are placeholders)

```text
1. engram_memory_search
   {"query": "<EXAMPLE: how the release tarball digest is verified>",
    "purpose_ref": "<PURPOSE_REF bound by your host>", "limit": 5}
   -> value.records[i].record.record_id = <RECORD_ID from the result>
2. engram_memory_get
   {"record_id": "<RECORD_ID from step 1>", "purpose_ref": "<same PURPOSE_REF>"}
   -> read and cite; if it already answers the point, stop here (no capture).
3. engram_memory_capture   (only for knowledge not already in memory)
   {"idempotency_key": "<EXAMPLE-KEY agent-a.task-42.capture-1>",
    "payload": {"schema_version": 2, "purpose_ref": "<same PURPOSE_REF>",
      "valid_time": {"t": <EXAMPLE epoch milliseconds, safe integer>},
      "components": [{"component_id": "<EXAMPLE c1>", "kind": "decision",
        "text": "<EXAMPLE decision and rationale>", "citation_ids": ["<EXAMPLE cit1>"]}],
      "primary_component_id": "<EXAMPLE c1>",
      "primary_event": {"at": <EXAMPLE safe integer, unit unverified>, "type_ref": "<EXAMPLE type ref>",
        "citation_id": "<EXAMPLE cit1>"},
      "citations": [{"citation_id": "<EXAMPLE cit1>", "source_ref": "<EXAMPLE source ref>",
        "locator": {"scheme": "<EXAMPLE scheme>", "value": "<EXAMPLE locator>"},
        "content_digest": "sha256:<64 lowercase hex of the cited content>"}]},
    "evidence": {"evidence_ref": "<EXAMPLE evidence ref>",
      "evidence_digest": "sha256:<64 lowercase hex>", "citation_ids": ["<EXAMPLE cit1>"]}}
   -> status "committed_pending", candidate_id = <CANDIDATE_ID>
4. engram_memory_request_admission
   {"candidate_id": "<CANDIDATE_ID from step 3>",
    "idempotency_key": "<EXAMPLE-KEY agent-a.task-42.admit-1>"}
   -> outcome.status accepted (record_id required) | rejected | pending_adjudication; report it as is.
```

On `MUTATION_OUTCOME_UNKNOWN` at step 3 or 4, resend the identical call with the same key.

## Open points

- Retention value (owner level): `max_retention_days` and defaults are host inputs with no approved value; the test-only reference port falls back to 30 days, which is not a policy.
- `unverified`: delivery of `purpose_ref` to agents; time unit of `primary_event.at` (`valid_time` uses epoch milliseconds on the shipped current-read path); `content_digest` canonicalization; admission `duplicate_exact` meaning; all h2a points in §6, including whether the reference topology is implemented in each host.

## Sources

Candidate `graphify-wt-mcpl4` `HEAD` `fb223377`:
- `src/mcp/memory/contracts.ts`: 142-156 (ids, names), 164-191 (neutral bindings), 196-223 (excluded ops), 229-246 (disclosable states), 260-306 (limits, default policy; 269-270 opaque-ref bytes, 284 instant pattern, 295 argument ceiling), 311-355 (inputs), 360-417 (outputs; 370-376 capture statuses), 437-458 (envelope).
- `src/mcp/memory/schemas.ts`: 81-82, 112-115, 845-853 (instants), 88-92, 873-884, 1009-1021 (opaque refs, NFC, 1-512 bytes), 890-893 (candidate id), 940-960 (argument ceiling), 127-213 (sub-schemas; 155-165, 190-198 `observed_at`/`expires_at` as Instant), 219-357 (input schemas), 497-522, 2699-2705 (admission `record_id`), 579-678 (outputs), 895-904 (key bytes), 1323-1345 (component `citation_ids` 1-256 distinct), 1425-1523 (cross-references; 1451-1463 unique `component_id`), 1526-1600 (retention, reconciliation), 1634-1662 (evidence `citation_ids` 1-256 distinct, resolving).
- `src/mcp/memory/errors.ts`: 84-397 (codes, retriable, messages), 424-435 (constant messages), 404-422 and 583-595 (`NOT_FOUND` normalization), 437-440 (protocol error), 669-720 (unknown outcome).
- `engram-memory/reads.ts`: 120-140 (`NOT_FOUND` after authorization on scope, trust or eligibility), 129-140, 169-172 (`valid_time` compared with `Date.parse` epoch ms); `engram-memory/dual-as-of.ts`: 9-14; `engram-memory/contracts/index.ts`: 385-392 (`AdmissionOutcomeV1`, optional `record_id`).
- `src/mcp/memory/gates.ts`: 79-139 (confirmation, TTL), 141-180 (gates), 182-281 (descriptors, idempotency scope), 292-312 (manifest, `secrets: []`).
- `src/mcp-memory/provider.ts`: 183-199, 557-560, 596-602 (`purpose_ref`), 349-370 (host retention), 428-452 (identity from binding), 578-584, 611-624 (key, read gates); `src/mcp-memory/server.ts`: 213-229, 263-279 (protocol errors), 395-415 (envelope).
- `src/memory-tools/writes.ts`: 319-327 (`DIGEST_CONFLICT`), 366-399 (confirmation), 536-560 (capture policy); `src/mcp/memory/policy.ts`: 315-321, 336-479 (405-428 `expires_at` after capture and within ceiling), 494-560; `src/mcp/memory/reference-ports.ts`: 28-36, 207.
- `engram-memory/engine.ts`: 1191-1208 (capture replay), 1256-1260 (fresh capture `committed_pending`), 1404-1406, 1426-1453 and 1488-1498 (same-scope tombstone guard on an accepting decision), 1501-1508 (accepted/rejected, `record_id` only on accept); `engram-memory/memory-store.ts`: 661-667 and `engram-memory/module-storage-memory-store.ts`: 627-632, 1190-1194 (intent hash); `engram-memory/schemas.ts`: 3-11, 41-46.
- `src/mcp/memory/topology.ts`: 17-31 (reference chain constant), 33-45, 136-146, 873-887, 924-939 (declared h2a storage profile).
- `spec/SPEC_MEMORY_MCP_V2.md`: 49-75 (M1; 49 independent per-tool discovery and authorization), 132-163 (M2), 165-192 (limits), 221-231, 313-360 (M3), 397-420 (M4; 401 no implied permissions), 432-491 (M5; 459-475 tombstone guard), 522-534 (M6), 579-614 (M7), 672-680 (tenant opt-in), 708, 747 (delivery and qualified enabled composition), 735-765 (disabled behavior, h2a config), 800-802 (D11 `unverified`), 989-1021 (M13).
- §4 exclusions: owner requirement, `BRIEF-memory-skill.md:27` (categorical list).

Sentropic `origin/feat/engram-e2-integration` (`873995d1`):
- `packages/cluster-mesh/src/engram-memory/binding.ts`: 17-18, 45-63, 105-139 (grants, `memory-neutral-<tenant>-<workspace>-<invocationId>`), 161-167 (foreign scope); `neutral-handle.ts`: 74-80.
- `packages/mcp-platform/src/memory/context-validation.ts`: 17-56; `frozen-context.ts`: 35-49; `confirmation-guard.ts`: 17-64; `confirmation.ts`: 8-24; `etc/mcp-platform-memory.api.md`: 24, 653.
- `packages/mcp-broker/src/memory/contracts.ts`: 48-55; `compiled-dispatch.ts`: 153-167, 178-183.
