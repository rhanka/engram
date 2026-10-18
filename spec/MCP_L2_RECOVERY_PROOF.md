# MCP-L2 canonical recovery proof

Oracle: SPEC-memory-mcp-v3.2.md M4 l.583–587; M5 l.702, 708–710, 730, 744.

Baseline at c5df0798: 4 committed cases RED, 4 uncommitted cases GREEN.
The same matrix now passes 8/8. Every case closes and reopens both canonical and host SQLite stores and creates a fresh engine with stateless test custody.
The assertions require unchanged canonical cursors, zero second writes, no policy decision, and no confirmation ceremony for committed results.

Reproduce: `node scripts/check-memory-mcp-l2-recovery-mutations.mjs`.
Mutations run serially against production source; every source is restored in `finally`.
A kill requires one actual failed matrix assertion; compilation or suite-load errors do not count.

Result: **4/4 killed**; restored baseline 8/8.

| Mutation | Result | Failing test |
|---|---|---|
| committed-confirmation | killed | MCP-L2 canonical recovery: withdraw should consult canonical proof before expired guards when committed=true |
| uncommitted-confirmation | killed | MCP-L2 canonical recovery: withdraw should consult canonical proof before expired guards when committed=false |
| committed-policy | killed | MCP-L2 canonical recovery: requestAdmission should consult canonical proof before expired guards when committed=true |
| uncommitted-policy | killed | MCP-L2 canonical recovery: requestAdmission should consult canonical proof before expired guards when committed=false |

Restored source SHA-256:

- `engram-memory/engine.ts`: `43fc799baddb2d355e504bb8aba74488f0fc85adb14a51a2d3056c0aafa124a7`
- `src/mcp/memory/policy.ts`: `59def0354c9612af3e1754078d3e23e41db9a1a2fdbb1bda546dc77d29f172cd`
- `src/memory-tools/writes.ts`: `b568a728789642566386fbdc6ac2746b8377657b50a876f694c468d5a66625b4`

Additional coverage: current host/neutral authorization after SQLite reopen (8 cases), and current confirmation/policy after asynchronous dependencies before commit (4 cases).
