<script>
  /**
   * Reconciliation view — FIRST-SLICE STUB.
   *
   * Lists candidates from the existing `/api/ontology/reconciliation/candidates`
   * JSON API so the wiring is proven, and lets you jump to a candidate's
   * canonical entity in the Workspace graph. The full candidate workbench
   * (compare block, evidence/audit drawer, patch apply) is a deliberate
   * follow-up — see the studio README. No graph reload happens here.
   */
  import { onMount } from "svelte";

  import { fetchReconciliationCandidates } from "../lib/api.js";

  let { graph, onOpenEntity } = $props();

  let candidates = $state([]);
  let total = $state(0);
  let stale = $state(false);
  let error = $state(null);
  let loaded = $state(false);

  onMount(async () => {
    const res = await fetchReconciliationCandidates();
    if (res?.error) error = res.error;
    candidates = res?.items ?? [];
    total = res?.total ?? candidates.length;
    stale = Boolean(res?.stale);
    loaded = true;
  });
</script>

<section class="recon">
  <header class="recon-head">
    <h2>Reconciliation</h2>
    <p class="recon-note">
      First-slice stub: candidate queue from the live API. Full candidate
      workbench (compare, evidence, patch apply) is a follow-up.
    </p>
  </header>

  {#if !loaded}
    <p class="recon-empty">Loading candidates…</p>
  {:else if error}
    <p class="recon-empty">Reconciliation API unavailable: {error}</p>
  {:else if candidates.length === 0}
    <p class="recon-empty">Reconciliation queue is empty.</p>
  {:else}
    <div class="recon-toolbar">
      <span class="recon-pill">{total} candidate(s)</span>
      <span class="recon-pill">stale: {stale ? "yes" : "no"}</span>
    </div>
    <ul class="recon-list">
      {#each candidates as c (c.id)}
        <li class="recon-row">
          <div class="recon-row-main">
            <strong>{c.id}</strong>
            <small>{c.candidate_id} → {c.canonical_id}</small>
            <small>{c.proposed_patch_operation} · score {Math.round((c.score ?? 0) * 100)}%</small>
          </div>
          <button class="recon-open" onclick={() => onOpenEntity?.(c.canonical_id)}>
            Open canonical
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .recon {
    padding: 1.5rem 2rem;
    max-width: 60rem;
    margin: 0 auto;
    height: 100%;
    overflow-y: auto;
  }
  .recon-head h2 {
    margin: 0;
  }
  .recon-note {
    margin: 0.25rem 0 1rem;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.85rem;
  }
  .recon-toolbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .recon-pill {
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-pill, 999px);
    padding: 0.1rem 0.6rem;
    font-size: 0.78rem;
    color: var(--st-semantic-text-secondary, #475569);
    background: var(--st-semantic-surface-subtle, #f8fafc);
  }
  .recon-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .recon-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-md, 8px);
    background: var(--st-semantic-surface-default, #fff);
  }
  .recon-row-main {
    display: grid;
    gap: 2px;
  }
  .recon-row-main small {
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.78rem;
  }
  .recon-open {
    border: 1px solid var(--st-semantic-border-strong, #94a3b8);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
    white-space: nowrap;
  }
</style>
