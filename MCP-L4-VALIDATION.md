# MCP-L4 candidate — closure evidence

Source: `5265c89824ec3c53feae4c311d31793bdbf965e3`, on `feat/memory-mcp-l4-candidate`.
Spec SHA-256: `18c697c1cd91287fd9f814c059910ffb4b39ddb1be46af547f384c7d912177b2`.
P2 manifest SHA-256: `2b85ff28b6fe06bda0abcdc19255f61a1ed1e4b7cfbb40c2e881c98dd234424b`.

This records candidate finding closure. L4 exit still requires qualification of this exact candidate by L5 and its checkpoint. It makes no production host or native storage qualification claim.

| Round-3 finding | Closure and behavioral evidence |
| --- | --- |
| A3 / S5 — mutation bindings | Confirmation verification and durable association receive the current principal namespace/ID, tenant, logical session and transport attachment. The injected elicitation reference is preserved. Another attachment is refused before commitment. |
| A4 / S6 — cancellation | The provider awaits the facade, propagates the signal into its execution control and the engine guard, and never abandons an uncancelled promise. Abort during authorization produces `CANCELLED` with zero reservations/engine calls; retry commits fresh. Abort during sealing produces no canonical commit; abort after commit preserves its receipt. |
| A7 / S7 — preflight | Host profile identities and digests must equal the frozen pins. Activation reads all three shipped profile assets and compares their exact bytes and identities. Missing/altered assets, wrong well-formed digests, absent required policy functions, and negative retention refuse before advertisement. |
| A9 / S9 — registry closure | `mcp.manifestAsset` loads `dist/registry/provider-manifest.js`, with the provider identity/version and six tools. The registry-package wrapper remains a distinct asset. The effective-manifest receipt hashes the provider asset. The build generates and verifies all 23 assets. |
| A11 / S11 — disabled installation | Ordinary scripts-enabled installation, without omitting optional dependencies. Observers start before npm: `Module.prototype._compile`, `Module._load`, an ESM loader registered by `--import`, initialization boundaries, and lifecycle child processes. Positive controls exercise each observer. Both output streams are collected. Observed provider loads/store opens/identity bootstraps/memory native builds: **0/0/0/0**. |
| A12 / S10 — packed acceptance | Fixture ports verify the credential, neutral principal, tenant, scope/store, connector, session, attachment and generation. Confirmation checks the exact reserved target, capability, operation digest, reference and current session. Substituting each binding is refused. SDK forged-provider and missing-context probes record zero provider entries. |
| New blocker — cached confirmation freshness | Only durable attachment is memoized. Every effect guard calls the current verifier, including after awaited attachment/claim. Revocation during sealing or authorization revalidation refuses capture/withdrawal with zero canonical effects. |
| New major — read authentication context | Read authentication uses a typed `MemoryReadInvocationV1` with `connector_instance_id`; write authentication uses its separate typed context. Required read fields are asserted individually. |
| New major — dispatch mistaken for commit entry | Commit state changes synchronously immediately before the engine invokes canonical commit. A throwing `nextSourceOrder()` maps to sanitized `STORE_UNAVAILABLE`, with zero reservations and engine calls. |
| New major — unusable validator asset | The dedicated ESM `dist/registry/validator.js` imports and executes without requiring the peers' import-only entries. Packed acceptance imports the declared asset and invokes it on the packed receipt/assets. |
| Minor — malformed purpose | Selection uses the verified host purpose; closed semantic argument validation then rejects over-budget/non-NFC purposes as `INVALID_SCHEMA` before comparing valid purposes. |
| Minor — unreachable pagination assertion | Two distinct admitted records force `next_page_cursor`. SDK acceptance follows the host handle, verifies a different record, and refuses altered query bindings and lost host state with `STALE_PAGE`. |
| Additional independent counterexample — abort while resuming a successful guard | The engine checks the signal separately from the guard verdict. An abort after the second guard returns `CANCELLED`, destroys the unowned sealed envelope, and performs zero commits. |
| Additional independent counterexample — admission cleanup failure | A known canonical admission receipt survives a throwing/refusing postcommit key cleanup; same-key replay returns the same accepted outcome with exactly one canonical effect. `AdmissionOutcomeV1` declares no key-cleanup completion status. |

All previously CLOSED round-3 findings remain covered: standard adapter typing, authentication before domain envelopes, resolver sanitization, qualified SDK discovery metadata, pure lazy definition, SDK/lock alignment, argument classification, complete transport-size accounting, stronger confirmation, committed lifecycle receipts with pending cleanup, ordinary-build generation, fatal SDK-floor failures, and packed-package-derived exports.

Verification:

- `npm run build && npm pack`, using npm **11.17.0**: passed. The system npm **9.2.0** rejects the existing override comparator; the unchanged substrate acceptance also requires npm >=10.
- Targeted suites: **151 passed**, **0 failed**, **12 files**.
- Fresh packed acceptance outside the source tree: passed, real canonical engine/facades and SDK transport. All six tools pass at pinned SDK **1.32.2** and exact floor **1.31.0**. The candidate manifest exports equal the packed `package.json` exports.
- Full candidate: **5,427 passed / 64 failed / 37 skipped**.
- Independently executed baseline `652cf65684c7e191c7ba90bfb515f2f3aef8b0c1`: **5,394 passed / 64 failed / 37 skipped**. The same installed dependency trees were used in a detached baseline archive inside this worktree. Its ordinary build reproduced missing `fs_ext.node`; `tsup --external fs-ext` materialized comparison bundles without changing baseline sources. All 64 failed test identities and normalized error signatures match; no failure was added or removed. These cover missing native fs-ext/SQLite support and the unchanged npm >=10 gate. PostgreSQL qualification remains unavailable.

The machine-readable companion `candidate-validation.json` records the failed identities/signatures and hashes of the complete build, targeted, packed, candidate and baseline logs. The tarball and its integrity are in `candidate-manifest.json`; that manifest and the publisher receipt refer to the exact packed bytes and remain outside npm files.

`unverified`: L5 qualification/checkpoint and public broker availability; deployed host identity/assurance, tenancy, policy and custody bindings; native SQLite/PostgreSQL qualification; host convergence of admission key cleanup, whose progress has no field in `AdmissionOutcomeV1`; the spec's later product/release and host-integration decisions.

Independent read-only review by Astra: **all round-3 findings closed; global validation incomplete**. No remaining blocking candidate finding was identified; all previously closed findings remain closed. The three additional counterexamples above were independently reverified. Astra independently checked the final tarball, all 23 assets, exports, source-map correspondence, seven log hashes and the exact baseline failure comparison. This is not a global PASS. The disposition is recorded in `candidate-validation.json`; the code author performed implementation verification without acting as reviewer.
