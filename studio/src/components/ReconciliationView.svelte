<script>
  /**
   * SVELTE-7: reconciliation workbench — same 3-column shell as the workspace.
   *   left  : filterable candidate list (like the search rail)
   *   center: graph scoped to the subgraph of the two candidate entities
   *   right : candidate compare panel + Accept / Reject buttons
   * Accept = accept_match patch (apply), Reject = reject_match patch (apply).
   * On a loopback --write server no token is needed (SVELTE-7 server change).
   */
  import { onMount } from "svelte";

  import WorkspaceShell from "./WorkspaceShell.svelte";
  import GraphCanvas from "./GraphCanvas.svelte";
  import Accordion from "./Accordion.svelte";
  import { fetchReconciliationCandidates, postPatchApply } from "../lib/api.js";
  import { buildPatchFromCandidate } from "../lib/reconciliation.js";
  import {
    candidateSubgraph,
    buildScene,
    indexNodes,
    nodeLabel,
    nodeType,
  } from "../lib/graphAdapter.js";

  let { graph, onOpenEntity } = $props();

  let candidates = $state([]);
  let total = $state(0);
  let stale = $state(false);
  let error = $state(null);
  let loaded = $state(false);
  let graphHash = $state("");
  let profileHash = $state("");
  let query = $state("");
  let activeId = $state(null);
  let busy = $state(false);
  let actionResult = $state(null);

  const idx = $derived(indexNodes(graph));
  const active = $derived(activeId ? (candidates.find((c) => c.id === activeId) ?? null) : null);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        String(c.candidate_id).toLowerCase().includes(q) ||
        String(c.canonical_id).toLowerCase().includes(q) ||
        (c.shared_terms ?? []).some((t) => String(t).toLowerCase().includes(q)),
    );
  });

  // Center graph: subgraph around the two candidate entities (focused context).
  const scene = $derived.by(() => {
    if (!active) return buildScene({ nodes: [], links: [] });
    const sub = candidateSubgraph(graph, active.candidate_id, active.canonical_id, 1);
    return buildScene(sub, { showWeakLinks: true });
  });
  const selectedIds = $derived(active ? [active.candidate_id, active.canonical_id] : []);

  function label(id) {
    const n = idx.get(id);
    return n ? nodeLabel(n) : id;
  }
  function typeOf(id) {
    const n = idx.get(id);
    return n ? nodeType(n) : null;
  }

  async function reload() {
    const res = await fetchReconciliationCandidates();
    if (res?.error) error = res.error;
    candidates = res?.items ?? [];
    total = res?.total ?? candidates.length;
    stale = Boolean(res?.stale);
    graphHash = res?.graph_hash ?? "";
    profileHash = res?.profile_hash ?? "";
    loaded = true;
    if (!activeId && candidates.length) activeId = candidates[0].id;
  }

  onMount(reload);

  async function decide(decision) {
    if (!active || busy) return;
    busy = true;
    actionResult = null;
    try {
      const patch = buildPatchFromCandidate(active, decision, { graphHash, profileHash });
      const res = await postPatchApply(patch);
      if (res.ok && res.valid !== false) {
        actionResult = { ok: true, msg: `${decision === "accept" ? "Accepted" : "Rejected"} — patch applied.` };
        // Drop the decided candidate from the queue and advance.
        const decidedId = active.id;
        candidates = candidates.filter((c) => c.id !== decidedId);
        total = Math.max(0, total - 1);
        activeId = candidates[0]?.id ?? null;
      } else {
        const issues = (res.issues ?? []).map((i) => i.message).join("; ");
        actionResult = { ok: false, msg: `Patch rejected (${res.status}): ${issues || res.error || "unknown"}` };
      }
    } catch (err) {
      actionResult = { ok: false, msg: String(err) };
    } finally {
      busy = false;
    }
  }
</script>

<WorkspaceShell>
  <div class="col col-left">
    <aside class="recon-rail" aria-label="Reconciliation candidates">
      <div class="recon-rail-search">
        <input
          type="search"
          placeholder="Filter candidates…"
          bind:value={query}
          aria-label="Filter reconciliation candidates"
        />
      </div>
      <div class="recon-rail-meta">
        <span class="recon-pill">{total} candidate(s)</span>
        <span class="recon-pill">stale: {stale ? "yes" : "no"}</span>
      </div>
      {#if !loaded}
        <p class="recon-empty">Loading…</p>
      {:else if error}
        <p class="recon-empty">API unavailable: {error}</p>
      {:else if filtered.length === 0}
        <p class="recon-empty">Reconciliation queue is empty.</p>
      {:else}
        <ul class="recon-rail-list">
          {#each filtered as c (c.id)}
            <li>
              <button
                class="recon-rail-row"
                class:active={activeId === c.id}
                onclick={() => { activeId = c.id; actionResult = null; }}
              >
                <span class="recon-rail-label">{label(c.candidate_id)} ↔ {label(c.canonical_id)}</span>
                <span class="recon-rail-score">{Math.round((c.score ?? 0) * 100)}%</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>

  <div class="col col-center">
    {#if active}
      <GraphCanvas
        {scene}
        {selectedIds}
        focusId={active.candidate_id}
        onSelect={(id) => onOpenEntity?.(id)}
        onOpenEntity={(id) => onOpenEntity?.(id)}
      />
    {:else}
      <p class="recon-center-empty">Select a candidate to see the two entities in context.</p>
    {/if}
  </div>

  <div class="col col-right">
    <aside class="recon-detail" aria-label="Candidate detail">
      {#if !active}
        <p class="recon-empty">No candidate selected.</p>
      {:else}
        <header class="recon-detail-head">
          <p class="recon-kicker">Reconciliation candidate</p>
          <h2>{label(active.candidate_id)} ↔ {label(active.canonical_id)}</h2>
          <p class="recon-detail-score">
            {active.proposed_patch_operation} · score {Math.round((active.score ?? 0) * 100)}%
          </p>
        </header>

        <dl class="recon-compare">
          <div><dt>Candidate</dt><dd>{label(active.candidate_id)} <small>{typeOf(active.candidate_id) ?? ""}</small></dd></div>
          <div><dt>Canonical</dt><dd>{label(active.canonical_id)} <small>{typeOf(active.canonical_id) ?? ""}</small></dd></div>
          {#if active.shared_terms?.length}
            <div><dt>Shared</dt><dd>{active.shared_terms.join(", ")}</dd></div>
          {/if}
        </dl>

        {#if active.reasons?.length}
          <Accordion title="Reasons" count={active.reasons.length} open={true}>
            <ul class="recon-reasons">
              {#each active.reasons as r (r)}<li>{r}</li>{/each}
            </ul>
          </Accordion>
        {/if}

        <!-- Evidence collapsed by default (user request). -->
        <Accordion title="Evidence" count={(active.evidence_refs ?? []).length} open={false}>
          {#if (active.evidence_refs ?? []).length === 0}
            <p class="recon-empty">No evidence refs.</p>
          {:else}
            <ul class="recon-evidence">
              {#each active.evidence_refs as ref (ref)}<li>{ref}</li>{/each}
            </ul>
          {/if}
        </Accordion>

        <div class="recon-actions">
          <button class="recon-accept" disabled={busy} onclick={() => decide("accept")}>
            {busy ? "Applying…" : "Accept match"}
          </button>
          <button class="recon-reject" disabled={busy} onclick={() => decide("reject")}>
            Reject match
          </button>
        </div>
        {#if actionResult}
          <p class="recon-result" class:ok={actionResult.ok} class:err={!actionResult.ok}>
            {actionResult.msg}
          </p>
        {/if}
      {/if}
    </aside>
  </div>
</WorkspaceShell>

<style>
  .col { min-height: 0; height: 100%; }
  .recon-rail,
  .recon-detail {
    background: var(--st-semantic-surface-default, #fff);
    overflow-y: auto;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .recon-rail-search {
    padding: 0.7rem 0.85rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .recon-rail-search input {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--st-semantic-border-strong, #94a3b8);
    border-radius: var(--st-radius-sm, 4px);
  }
  .recon-rail-meta {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem 0.85rem;
  }
  .recon-pill {
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-pill, 999px);
    padding: 0.05rem 0.55rem;
    font-size: 0.74rem;
    color: var(--st-semantic-text-secondary, #475569);
    background: var(--st-semantic-surface-subtle, #f8fafc);
  }
  .recon-rail-list { list-style: none; margin: 0; padding: 0 0.5rem; display: grid; gap: 2px; }
  .recon-rail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.4rem 0.5rem;
    cursor: pointer;
    font-size: 0.82rem;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .recon-rail-row:hover { background: var(--st-semantic-surface-subtle, #f8fafc); }
  .recon-rail-row.active {
    border-color: var(--st-semantic-action-primary, #2563eb);
    box-shadow: inset 3px 0 0 var(--st-semantic-action-primary, #2563eb);
  }
  .recon-rail-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .recon-rail-score { font-variant-numeric: tabular-nums; color: var(--st-semantic-text-muted, #64748b); font-size: 0.74rem; }
  .recon-detail { padding: 1rem 1.1rem 2rem; }
  .recon-kicker {
    margin: 0; text-transform: uppercase; letter-spacing: 0.06em;
    font-size: 0.7rem; font-weight: 700; color: var(--st-semantic-text-muted, #64748b);
  }
  .recon-detail-head h2 { margin: 0.15rem 0 0.2rem; font-size: 1.05rem; line-height: 1.25; }
  .recon-detail-score { margin: 0; font-size: 0.8rem; color: var(--st-semantic-text-muted, #64748b); }
  .recon-compare { margin: 0.9rem 0 0; display: grid; gap: 0.3rem; font-size: 0.84rem; }
  .recon-compare > div { display: grid; grid-template-columns: 6rem 1fr; gap: 0.5rem; }
  .recon-compare dt {
    margin: 0; color: var(--st-semantic-text-muted, #64748b);
    text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.68rem; font-weight: 600;
  }
  .recon-compare dd { margin: 0; }
  .recon-compare small { color: var(--st-semantic-text-muted, #64748b); }
  .recon-reasons, .recon-evidence {
    list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem;
    font-size: 0.8rem; color: var(--st-semantic-text-secondary, #475569);
  }
  .recon-evidence li { overflow-wrap: anywhere; }
  .recon-actions { margin-top: 1.2rem; display: flex; gap: 0.5rem; }
  .recon-accept, .recon-reject {
    flex: 1; border-radius: var(--st-radius-sm, 4px); padding: 0.5rem 0.7rem;
    cursor: pointer; font-size: 0.85rem; font-weight: 600;
  }
  .recon-accept {
    border: 1px solid var(--st-semantic-action-primary, #2563eb);
    background: var(--st-semantic-action-primary, #2563eb);
    color: var(--st-semantic-action-primaryText, #fff);
  }
  .recon-accept:disabled { opacity: 0.6; cursor: progress; }
  .recon-reject {
    border: 1px solid var(--st-semantic-border-strong, #94a3b8);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .recon-result { margin-top: 0.6rem; font-size: 0.82rem; }
  .recon-result.ok { color: var(--st-semantic-feedback-success, #16a34a); }
  .recon-result.err { color: var(--st-semantic-feedback-error, #dc2626); }
  .recon-empty, .recon-center-empty {
    color: var(--st-semantic-text-muted, #64748b); font-size: 0.85rem; font-style: italic;
    padding: 1rem;
  }
  .recon-center-empty { display: grid; place-items: center; height: 100%; }
</style>
