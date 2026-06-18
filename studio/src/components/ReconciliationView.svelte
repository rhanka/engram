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
  import { SvelteSet } from "svelte/reactivity";

  import { Badge, Collapsible } from "@sentropic/design-system-svelte";

  import WorkspaceShell from "./WorkspaceShell.svelte";
  import GraphCanvas from "./GraphCanvas.svelte";
  import { fetchReconciliationCandidates, postPatchApply } from "../lib/api.js";
  import { buildPatchFromCandidate } from "../lib/reconciliation.js";
  import {
    candidateSubgraph,
    buildScene,
    withReconcileEdge,
    attachReconLayout,
    reconTwinPinOffset,
    indexNodes,
    nodeLabel,
    nodeType,
    RECON_SUBGRAPH_DEPTH,
    RECON_SUBGRAPH_MAX_NODES,
  } from "../lib/graphAdapter.js";

  // BUG-1: `labelMaxChars` parameterizes the DRAWN focal-box label length. The
  // two recon entities are pinned close together; a long name (e.g. "Dr. John H.
  // Watson") otherwise sizes an over-wide box that overflows the slot. The full
  // name remains on hover (GraphCanvas tooltip) and in the rail/detail `title`s.
  // #4.1: `reconDepth` controls how far the focal pair's neighbourhood is
  // expanded (default 3 — see RECON_SUBGRAPH_DEPTH). Fan-out is capped at
  // RECON_SUBGRAPH_MAX_NODES inside candidateSubgraph so a deep ball around a
  // high-degree hub can't explode into an unreadable hairball.
  let { graph, onOpenEntity, labelMaxChars = 22, reconDepth = RECON_SUBGRAPH_DEPTH } = $props();

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
  // UAT R8-4: drives the GraphCanvas merge animation on accept.
  let mergePair = $state(null);
  let pendingDecision = $state(null);

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

  // #4 (a): GROUP the candidate list by entity TYPE (Character, Location, Work…)
  // so the rail reads as typed sections with headers. The type is the candidate
  // node's type from the graph (typeOf); we fall back to the canonical side, then
  // to "Other" when neither node is in the loaded graph (stale ids). Within a
  // group, candidates stay in their incoming (score-desc) order.
  const TYPE_GROUP_ORDER = [
    "Character",
    "Alias",
    "DisguisePersona",
    "NarrativeRole",
    "Location",
    "Organization",
    "Object",
    "Evidence",
    "Case",
    "CrimeOrScheme",
    "Event",
    "ForensicMethod",
    "Motive",
    "Fact",
    "Work",
    "ChapterOrStory",
    "Saga",
    "Author",
    "Translator",
    "Other",
  ];
  const TYPE_GROUP_RANK = new Map(TYPE_GROUP_ORDER.map((type, index) => [type, index]));
  const grouped = $derived.by(() => {
    const buckets = new Map();
    for (const c of filtered) {
      const t = typeOf(c.candidate_id) ?? typeOf(c.canonical_id) ?? "Other";
      if (!buckets.has(t)) buckets.set(t, []);
      buckets.get(t).push(c);
    }
    // Domain type order first; unknown types fall back to alphabetical order.
    return [...buckets.entries()]
      .sort((a, b) => {
        const ar = TYPE_GROUP_RANK.get(a[0]) ?? 999;
        const br = TYPE_GROUP_RANK.get(b[0]) ?? 999;
        return ar - br || a[0].localeCompare(b[0]);
      })
      .map(([type, items]) => ({ type, items }));
  });

  // #4 (d): batch-selection state. A Set of candidate ids ticked for bulk action.
  let selected = $state(new SvelteSet());
  // Only ids still present in the (filtered) queue count toward bulk actions.
  const selectedCount = $derived(
    filtered.reduce((n, c) => (selected.has(c.id) ? n + 1 : n), 0),
  );
  const allFilteredSelected = $derived(
    filtered.length > 0 && filtered.every((c) => selected.has(c.id)),
  );
  // Bulk progress feedback (e.g. "Validated 4 of 6 — 2 failed").
  let bulkResult = $state(null);

  function toggleSelected(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
  function toggleSelectAll() {
    if (allFilteredSelected) {
      for (const c of filtered) selected.delete(c.id);
    } else {
      for (const c of filtered) selected.add(c.id);
    }
  }

  // Center graph: subgraph around the two candidate entities (focused context).
  // The twins usually have no direct edge, so we (a) pin them side by side and
  // (b) add a bold synthetic "reconcile" edge so they read as a pair.
  //
  // #2.2 fix: the subgraph nodes otherwise keep their scattered full-graph
  // positions and there is no live sim, so fitView framed a scattered set with
  // the twins off-centre. We now run a LOCAL deterministic force layout over the
  // subgraph with the twins HELD FIXED at the centre, so the neighbours settle
  // AROUND the centred, side-by-side pair (a compact, centred, twinned cluster).
  const scene = $derived.by(() => {
    if (!active) return buildScene({ nodes: [], links: [] });
    // #4.1: expand each entity's neighbourhood to DEPTH reconDepth (default 3),
    // capped at RECON_SUBGRAPH_MAX_NODES nodes (fan-out cap, see candidateSubgraph).
    const sub = candidateSubgraph(graph, active.candidate_id, active.canonical_id, reconDepth, {
      maxNodes: RECON_SUBGRAPH_MAX_NODES,
    });
    const base = buildScene(sub, { showWeakLinks: true });
    const linked = withReconcileEdge(base, active.candidate_id, active.canonical_id);
    // Pin the two twins symmetrically near the centre so both stay in view. We
    // DROP each subgraph node's inherited x/y so only the twins' fx/fy seed the
    // local sim; the neighbours are placed by the layout, not their stale coords.
    // dx is COMPUTED from the two focal labels' drawn box widths (world units,
    // zoom-independent — see reconTwinPinOffset): wide labels ("Dr. John H.
    // Watson" × 2) get exactly the offset they need to clear each other plus a
    // small gap; short labels stay compact. Never a hand-tuned constant again.
    const cx = 360, cy = 280;
    const sceneLabel = (id) => {
      const n = linked.nodes.find((node) => node.id === id);
      // Same fallback chain as the renderer payload (label || id).
      return n ? (n.label || String(n.id)) : String(id);
    };
    const dx = reconTwinPinOffset(
      sceneLabel(active.candidate_id),
      sceneLabel(active.canonical_id),
    );
    // Recon focal-pair parity: the two entities under comparison must ALWAYS
    // render IDENTICALLY — both as labelled rounded boxes — regardless of the
    // degree-based god-class box gate in buildScene (which would otherwise box
    // the high-degree canonical but leave the unmerged candidate twin as its
    // type glyph). View-scoped override: `forceBoxLabel` tells the renderer
    // payload to bypass the degree/god-class label gate so BOTH boxes carry
    // their text in-box. The surrounding neighbours keep their normal shapes.
    const focal = { shape: "roundedbox", forceBoxLabel: true };
    const nodes = linked.nodes.map((n) => {
      const { x: _x, y: _y, fx: _fx, fy: _fy, ...rest } = n;
      if (n.id === active.candidate_id) return { ...rest, ...focal, fx: cx - dx, fy: cy };
      if (n.id === active.canonical_id) return { ...rest, ...focal, fx: cx + dx, fy: cy };
      return rest;
    });
    // Run the local layout (twins fixed) so neighbours arrange around the pair.
    return attachReconLayout({ ...linked, nodes });
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
  // BUG-2: a candidate references two node ids; either can be ABSENT from the
  // loaded graph (e.g. a stale candidates queue whose ids no longer match a
  // re-extracted graph). When that happens the centre graph can only render ONE
  // box, so the proposed pair reads as a lone node. We detect the missing side
  // here so the panels can flag it explicitly instead of silently degrading.
  function present(id) {
    return id != null && idx.has(id);
  }
  const missingSides = $derived.by(() => {
    if (!active) return [];
    const out = [];
    if (!present(active.candidate_id)) out.push({ role: "Candidate", id: active.candidate_id });
    if (!present(active.canonical_id)) out.push({ role: "Canonical", id: active.canonical_id });
    return out;
  });

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
    // R8-4: on ACCEPT, play the merge animation first (candidate slides into
    // canonical), then apply the patch in handleMergeComplete. Reject applies now.
    if (decision === "accept") {
      pendingDecision = { decision, candidate: active };
      mergePair = { id: active.id, from: active.candidate_id, into: active.canonical_id };
      return;
    }
    await applyDecision(decision, active);
  }

  function handleMergeComplete() {
    const pending = pendingDecision;
    pendingDecision = null;
    mergePair = null;
    if (pending) void applyDecision(pending.decision, pending.candidate);
  }

  async function applyDecision(decision, cand) {
    if (!cand || busy) return;
    busy = true;
    actionResult = null;
    try {
      const patch = buildPatchFromCandidate(cand, decision, { graphHash, profileHash });
      const res = await postPatchApply(patch);
      if (res.ok && res.valid !== false) {
        actionResult = { ok: true, msg: `${decision === "accept" ? "Accepted" : "Rejected"} — patch applied.` };
        // Drop the decided candidate from the queue and advance.
        const decidedId = cand.id;
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

  // #4 (d): BATCH validation. Apply the same decision (accept | reject) to every
  // ticked candidate. We snapshot the targets up front (the queue mutates as we
  // remove decided rows), apply patches sequentially so the write server isn't
  // hammered, count outcomes, then drop the succeeded ones and report a summary.
  // No merge animation here — that single-pair flourish would serialise oddly
  // across a bulk run; bulk is a queue-clearing action, not a focused merge.
  async function decideBulk(decision) {
    if (busy) return;
    const targets = filtered.filter((c) => selected.has(c.id));
    if (targets.length === 0) return;
    busy = true;
    bulkResult = null;
    actionResult = null;
    let ok = 0;
    const failures = [];
    try {
      for (const cand of targets) {
        try {
          const patch = buildPatchFromCandidate(cand, decision, { graphHash, profileHash });
          const res = await postPatchApply(patch);
          if (res.ok && res.valid !== false) {
            ok += 1;
            selected.delete(cand.id);
            candidates = candidates.filter((c) => c.id !== cand.id);
            total = Math.max(0, total - 1);
          } else {
            const issues = (res.issues ?? []).map((i) => i.message).join("; ");
            failures.push(`${cand.id}: ${issues || res.error || res.status}`);
          }
        } catch (err) {
          failures.push(`${cand.id}: ${String(err)}`);
        }
      }
    } finally {
      busy = false;
    }
    // Keep the active selection valid after the queue shrank.
    if (activeId && !candidates.some((c) => c.id === activeId)) {
      activeId = candidates[0]?.id ?? null;
    }
    const verb = decision === "accept" ? "Validated" : "Rejected";
    bulkResult = {
      ok: failures.length === 0,
      msg:
        failures.length === 0
          ? `${verb} ${ok} candidate(s).`
          : `${verb} ${ok} of ${targets.length} — ${failures.length} failed: ${failures.join(" · ")}`,
    };
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
        <!-- #4 (d): batch validation bar — select all + bulk validate/reject. -->
        <div class="recon-bulk-bar">
          <label class="recon-bulk-all">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onchange={toggleSelectAll}
              aria-label="Select all candidates"
            />
            <span>{selectedCount} selected</span>
          </label>
          <div class="recon-bulk-actions">
            <button
              class="recon-bulk-accept"
              disabled={busy || selectedCount === 0}
              onclick={() => decideBulk("accept")}
            >Validate</button>
            <button
              class="recon-bulk-reject"
              disabled={busy || selectedCount === 0}
              onclick={() => decideBulk("reject")}
            >Reject</button>
          </div>
        </div>
        {#if bulkResult}
          <p class="recon-bulk-result" class:ok={bulkResult.ok} class:err={!bulkResult.ok}>
            {bulkResult.msg}
          </p>
        {/if}

        <!-- #4 (a): candidates GROUPED by entity type, with type headers. -->
        <div class="recon-rail-groups">
          {#each grouped as group (group.type)}
            <details class="recon-group">
              <summary class="recon-group-head">
                <span class="recon-group-type">{group.type}</span>
                <span class="recon-group-count">{group.items.length}</span>
              </summary>
              <ul class="recon-rail-list">
                {#each group.items as c (c.id)}
                  <li
                    class="recon-rail-item"
                    class:active={activeId === c.id}
                    class:checked={selected.has(c.id)}
                  >
                    <!-- #4 (d): per-candidate checkbox for batch selection. -->
                    <input
                      class="recon-rail-check"
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onchange={() => toggleSelected(c.id)}
                      aria-label={`Select ${label(c.candidate_id)} ↔ ${label(c.canonical_id)}`}
                    />
                    <button
                      class="recon-rail-row"
                      onclick={() => { activeId = c.id; actionResult = null; }}
                    >
                      <!-- #4 (c): the two entities on TWO separate lines. -->
                      <span class="recon-rail-pair">
                        <span class="recon-rail-line" title={label(c.candidate_id)}>{label(c.candidate_id)}</span>
                        <span class="recon-rail-line recon-rail-canon" title={label(c.canonical_id)}>{label(c.canonical_id)}</span>
                      </span>
                      <!-- #4 (b): match score as a % bubble on the RIGHT. -->
                      <span class="recon-score-bubble" title={`Match score ${Math.round((c.score ?? 0) * 100)}%`}>
                        {Math.round((c.score ?? 0) * 100)}%
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            </details>
          {/each}
        </div>
      {/if}
    </aside>
  </div>

  <div class="col col-center">
    {#if active}
      <GraphCanvas
        {scene}
        {selectedIds}
        centerOnIds={selectedIds}
        focusId={active.candidate_id}
        labelMode="plain"
        {labelMaxChars}
        onSelect={(id) => onOpenEntity?.(id)}
        onOpenEntity={(id) => onOpenEntity?.(id)}
        {mergePair}
        onMergeComplete={handleMergeComplete}
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
          <p class="recon-kicker">Proposed match · these two entities</p>
          <h2 title={`${label(active.candidate_id)} ↔ ${label(active.canonical_id)}`}>
            {label(active.candidate_id)} ↔ {label(active.canonical_id)}
          </h2>
          <p class="recon-detail-score">
            {active.proposed_patch_operation} · score {Math.round((active.score ?? 0) * 100)}%
          </p>
        </header>

        {#if missingSides.length}
          <p class="recon-warning" role="alert">
            {missingSides.map((s) => `${s.role} “${s.id}”`).join(" and ")}
            {missingSides.length > 1 ? "are" : "is"} not in the loaded graph — the
            pair can’t be shown in full. The reconciliation queue may be stale
            (regenerate candidates for the current graph).
          </p>
        {/if}

        <dl class="recon-compare">
          <div><dt>Candidate</dt><dd title={label(active.candidate_id)}>{label(active.candidate_id)} <small>{typeOf(active.candidate_id) ?? (present(active.candidate_id) ? "" : "missing")}</small></dd></div>
          <div><dt>Canonical</dt><dd title={label(active.canonical_id)}>{label(active.canonical_id)} <small>{typeOf(active.canonical_id) ?? (present(active.canonical_id) ? "" : "missing")}</small></dd></div>
          {#if active.shared_terms?.length}
            <div><dt>Shared</dt><dd>{active.shared_terms.join(", ")}</dd></div>
          {/if}
        </dl>

        {#if active.reasons?.length}
          <Collapsible title="Reasons" open={true}>
            {#snippet trailing()}
              <Badge shape="circle" size="sm" tone="neutral">{active.reasons.length}</Badge>
            {/snippet}
            <ul class="recon-reasons">
              {#each active.reasons as r (r)}<li>{r}</li>{/each}
            </ul>
          </Collapsible>
        {/if}

        <!-- Evidence collapsed by default (user request). -->
        <Collapsible title="Evidence" open={false}>
          {#snippet trailing()}
            <Badge shape="circle" size="sm" tone="neutral">{(active.evidence_refs ?? []).length}</Badge>
          {/snippet}
          {#if (active.evidence_refs ?? []).length === 0}
            <p class="recon-empty">No evidence refs.</p>
          {:else}
            <ul class="recon-evidence">
              {#each active.evidence_refs as ref (ref)}<li>{ref}</li>{/each}
            </ul>
          {/if}
        </Collapsible>

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
  /* #4 (d): batch-validation bar. */
  .recon-bulk-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.85rem 0.5rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .recon-bulk-all {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.76rem; color: var(--st-semantic-text-secondary, #475569);
    cursor: pointer;
  }
  .recon-bulk-actions { display: flex; gap: 0.35rem; }
  .recon-bulk-accept, .recon-bulk-reject {
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.28rem 0.6rem;
    font-size: 0.76rem; font-weight: 600; cursor: pointer;
  }
  .recon-bulk-accept {
    border: 1px solid var(--st-semantic-action-primary, #2563eb);
    background: var(--st-semantic-action-primary, #2563eb);
    color: var(--st-semantic-action-primaryText, #fff);
  }
  .recon-bulk-reject {
    border: 1px solid var(--st-semantic-border-strong, #94a3b8);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .recon-bulk-accept:disabled, .recon-bulk-reject:disabled { opacity: 0.5; cursor: not-allowed; }
  .recon-bulk-result { margin: 0.4rem 0.85rem 0; font-size: 0.76rem; line-height: 1.35; }
  .recon-bulk-result.ok { color: var(--st-semantic-feedback-success, #16a34a); }
  .recon-bulk-result.err { color: var(--st-semantic-feedback-error, #dc2626); }

  /* #4 (a): type-grouped sections. */
  .recon-rail-groups { padding: 0.35rem 0; }
  .recon-group { margin: 0 0 0.4rem; }
  .recon-group[open] { padding-bottom: 0.15rem; }
  .recon-group-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.5rem; margin: 0; padding: 0.3rem 0.85rem 0.25rem;
    position: sticky; top: 0; z-index: 1;
    background: var(--st-semantic-surface-default, #fff);
    text-transform: uppercase; letter-spacing: 0.05em;
    font-size: 0.68rem; font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    cursor: pointer;
    list-style: none;
  }
  .recon-group-head::-webkit-details-marker { display: none; }
  .recon-group-head::before {
    content: ">";
    display: inline-block;
    width: 0.75rem;
    margin-right: 0.2rem;
    transition: transform 120ms ease;
  }
  .recon-group[open] .recon-group-head::before { transform: rotate(90deg); }
  .recon-group-type { flex: 1; }
  .recon-group-count {
    font-variant-numeric: tabular-nums;
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-pill, 999px);
    padding: 0 0.4rem; min-width: 1.4rem; text-align: center;
  }

  .recon-rail-list { list-style: none; margin: 0; padding: 0.15rem 0.5rem; display: grid; gap: 2px; }
  /* #4 (d): row = checkbox + clickable body. */
  .recon-rail-item {
    display: flex; align-items: stretch; gap: 0.35rem;
    border: 1px solid transparent;
    border-radius: var(--st-radius-sm, 4px);
  }
  .recon-rail-item.active {
    border-color: var(--st-semantic-action-primary, #2563eb);
    box-shadow: inset 3px 0 0 var(--st-semantic-action-primary, #2563eb);
  }
  .recon-rail-item.checked { background: var(--st-semantic-surface-subtle, #f1f5f9); }
  .recon-rail-check { margin: 0 0 0 0.35rem; align-self: center; cursor: pointer; }
  .recon-rail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex: 1; min-width: 0;
    text-align: left;
    border: none;
    background: transparent;
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.4rem 0.5rem;
    cursor: pointer;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .recon-rail-row:hover { background: var(--st-semantic-surface-subtle, #f8fafc); }
  /* #4 (c): two entities, two lines. */
  .recon-rail-pair { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .recon-rail-line {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.82rem; line-height: 1.25;
  }
  .recon-rail-canon { color: var(--st-semantic-text-secondary, #475569); font-size: 0.78rem; }
  /* #4 (b): score bubble, pinned right. */
  .recon-score-bubble {
    flex: none;
    font-variant-numeric: tabular-nums;
    font-size: 0.72rem; font-weight: 700;
    color: var(--st-semantic-action-primaryText, #fff);
    background: var(--st-semantic-action-primary, #2563eb);
    border-radius: var(--st-radius-pill, 999px);
    padding: 0.1rem 0.45rem;
    min-width: 2.4rem; text-align: center;
    align-self: center;
  }
  .recon-detail { padding: 1rem 1.1rem 2rem; }
  .recon-kicker {
    margin: 0; text-transform: uppercase; letter-spacing: 0.06em;
    font-size: 0.7rem; font-weight: 700; color: var(--st-semantic-text-muted, #64748b);
  }
  .recon-detail-head h2 {
    margin: 0.15rem 0 0.2rem; font-size: 1.05rem; line-height: 1.25;
    /* BUG-1: long entity names must not overflow the panel; wrap, then clamp to
       two lines with an ellipsis. Full text stays on the title hover. */
    overflow-wrap: anywhere;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .recon-detail-score { margin: 0; font-size: 0.8rem; color: var(--st-semantic-text-muted, #64748b); }
  /* BUG-2: stale/dangling-id warning when a proposed side is missing from the graph. */
  .recon-warning {
    margin: 0.7rem 0 0; padding: 0.5rem 0.6rem; font-size: 0.78rem; line-height: 1.35;
    border: 1px solid var(--st-semantic-feedback-warningBorder, #fcd34d);
    background: var(--st-semantic-feedback-warningSurface, #fffbeb);
    color: var(--st-semantic-feedback-warningText, #92400e);
    border-radius: var(--st-radius-sm, 4px);
  }
  .recon-compare { margin: 0.9rem 0 0; display: grid; gap: 0.3rem; font-size: 0.84rem; }
  .recon-compare > div { display: grid; grid-template-columns: 6rem 1fr; gap: 0.5rem; }
  .recon-compare dt {
    margin: 0; color: var(--st-semantic-text-muted, #64748b);
    text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.68rem; font-weight: 600;
  }
  .recon-compare dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
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
