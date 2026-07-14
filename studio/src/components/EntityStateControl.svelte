<script>
  /**
   * Per-entity 4-state VISIBILITY control (D6) — the row affordance that
   * SUPERSEDES the old group checkbox. At rest it shows ONE inline-SVG glyph for
   * the entity's current state (visible at a glance across ~122 rows); on hover /
   * focus / touch-tap it reveals a 4-row radiogroup OVERLAY (a DS Popover, so
   * the rail never reflows) where any state is one click away.
   *
   *   Normal · Grouped · Hidden · Solo   (mutually visible; radiogroup semantics)
   *
   * WAI-ARIA radiogroup + roving tabindex (the CHECKED row is the single tab
   * stop; Arrow/Home/End move+select; Escape collapses). Absorbed rows (a type
   * under a grouped parent) render the whole control DISABLED. Wiring is a single
   * `onSetState(key, nextState)` up to App's `setEntityState` reducer.
   */
  import { Popover } from "@sentropic/design-system-svelte";

  let {
    key,
    label = "",
    // The DISPLAYED state (displayedEntityState). Aliased to `entityState` locally
    // so the `$state` rune is never shadowed by a prop called `state`.
    state: entityState = "normal",
    disabled = false,
    // When absorbed by a grouped parent, the parent's label (for the tooltip).
    absorbedBy = null,
    // Dim the at-rest glyph while a Solo is active elsewhere (this row is masked out).
    dim = false,
    onSetState,
  } = $props();

  const STATES = [
    { id: "normal", label: "Normal", hint: "Normal — visible, ungrouped" },
    { id: "grouped", label: "Grouped", hint: "Grouped — collapse into a group node" },
    { id: "hidden", label: "Hidden", hint: "Hidden — remove from the graph" },
    { id: "solo", label: "Show only", hint: "Solo — show only this entity" },
  ];

  let open = $state(false);
  let hovering = $state(false);
  let focused = $state(false);
  // The 4 radio elements, for roving-focus management.
  let radioEls = $state([]);

  const currentLabel = $derived(STATES.find((s) => s.id === entityState)?.label ?? "Normal");
  const glyphTitle = $derived(
    disabled && absorbedBy
      ? `grouped by parent ${absorbedBy}`
      : `Visibility: ${label} — ${currentLabel}`,
  );

  function toggleOpen(event) {
    event?.stopPropagation?.();
    if (!disabled) open = !open;
  }
  function reveal() {
    if (disabled) return;
    open = true;
  }
  function maybeClose() {
    if (!hovering && !focused) open = false;
  }
  function onEnter() {
    hovering = true;
    reveal();
  }
  function onLeave() {
    hovering = false;
    // Defer so a move onto the popover (focus) keeps it open.
    queueMicrotask(maybeClose);
  }
  function onFocusIn() {
    focused = true;
    reveal();
  }
  function onFocusOut() {
    focused = false;
    queueMicrotask(maybeClose);
  }

  function focusRadio(index) {
    const n = STATES.length;
    const i = ((index % n) + n) % n;
    radioEls[i]?.focus();
  }
  function currentIndex() {
    const i = STATES.findIndex((s) => s.id === entityState);
    return i < 0 ? 0 : i;
  }

  function select(next, event) {
    event?.stopPropagation?.();
    if (disabled || typeof key !== "string") return;
    onSetState?.(key, next);
    open = false;
  }

  // Glyph button (collapsed): keyboard entry into the radiogroup.
  function onGlyphKeydown(event) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      reveal();
      // Focus the checked segment once the popover has rendered.
      queueMicrotask(() => focusRadio(currentIndex()));
    }
  }

  // Radiogroup roving navigation (WAI-ARIA radio pattern).
  function onRadioKeydown(event, index) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        select(STATES[(index + 1) % STATES.length].id);
        focusRadio(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        select(STATES[(index - 1 + STATES.length) % STATES.length].id);
        focusRadio(index - 1);
        break;
      case "Home":
        event.preventDefault();
        select(STATES[0].id);
        focusRadio(0);
        break;
      case "End":
        event.preventDefault();
        select(STATES[STATES.length - 1].id);
        focusRadio(STATES.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        open = false;
        break;
      default:
        break;
    }
  }
</script>

<!-- TEMP glyphs — pending the DS-prescribed Sentropic icon set (handoff sent to the design-system peer); these get hot-swapped for an <Icon> from @sentropic/design-system-svelte. Do NOT redesign icons here. -->
{#snippet glyph(id)}
  {#if id === "normal"}
    <svg class="esc-svg" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.4" />
    </svg>
  {:else if id === "grouped"}
    <svg class="esc-svg" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <rect x="2" y="2" width="10" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4" />
      <circle cx="7" cy="7" r="1.8" fill="currentColor" />
    </svg>
  {:else if id === "hidden"}
    <svg class="esc-svg" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <path d="M1.5 7 C3 4 11 4 12.5 7 C11 10 3 10 1.5 7 Z" fill="none" stroke="currentColor" stroke-width="1.2" />
      <circle cx="7" cy="7" r="1.6" fill="currentColor" />
      <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" stroke-width="1.4" />
    </svg>
  {:else}
    <svg class="esc-svg esc-svg--solo" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.3" />
      <circle cx="7" cy="7" r="2.4" fill="currentColor" />
    </svg>
  {/if}
{/snippet}

<div
  class="esc"
  class:esc--dim={dim && entityState === "normal"}
  class:esc--solo={entityState === "solo"}
  role="group"
  aria-label={`Visibility control: ${label}`}
  onpointerenter={onEnter}
  onpointerleave={onLeave}
  onfocusin={onFocusIn}
  onfocusout={onFocusOut}
>
  <Popover label={`Visibility for ${label}`} open={open} placement="bottom-start">
    {#snippet trigger()}
      <button
        type="button"
        class="esc-glyph"
        class:esc-glyph--solo={entityState === "solo"}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={glyphTitle}
        title={glyphTitle}
        {disabled}
        onclick={toggleOpen}
        onkeydown={onGlyphKeydown}
      >
        {@render glyph(entityState)}
      </button>
    {/snippet}
    {#snippet children()}
      <div class="esc-segments" role="radiogroup" aria-label={`Visibility: ${label}`}>
        {#each STATES as s, i (s.id)}
          <button
            type="button"
            bind:this={radioEls[i]}
            class="esc-seg"
            class:esc-seg--on={entityState === s.id}
            role="radio"
            aria-checked={entityState === s.id}
            aria-label={s.label}
            title={s.hint}
            tabindex={entityState === s.id ? 0 : -1}
            onclick={(e) => select(s.id, e)}
            onkeydown={(e) => onRadioKeydown(e, i)}
          >
            {@render glyph(s.id)}
            <span class="esc-seg-label">{s.label}</span>
          </button>
        {/each}
      </div>
    {/snippet}
  </Popover>
</div>

<style>
  .esc {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
  /* At-rest glyph — a bare 16px button carrying the current-state SVG. */
  .esc-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--st-semantic-text-secondary, #475569);
    cursor: pointer;
    border-radius: 4px;
  }
  .esc-glyph:hover:not(:disabled),
  .esc-glyph:focus-visible {
    color: var(--st-semantic-text-primary, #0f172a);
    background: var(--st-semantic-surface-muted, rgba(100, 116, 139, 0.12));
  }
  .esc-glyph:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  /* Solo is the only state that also masks OTHER rows, so it alone gets an accent. */
  .esc-glyph--solo {
    color: var(--st-semantic-feedback-info, #2563eb);
  }
  /* While a Solo is active elsewhere, a masked-out Normal row reads dimmer so the
     global masking is legible in the rail (no reflow — opacity only). */
  .esc--dim .esc-glyph {
    opacity: 0.45;
  }
  .esc-svg {
    display: block;
  }
  /* The 4-row radiogroup overlay (inside the DS Popover panel — no rail reflow). */
  .esc-segments {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding: 2px;
  }
  .esc-seg {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 30px;
    gap: 8px;
    padding: 5px 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--st-semantic-text-secondary, #475569);
    cursor: pointer;
    border-radius: 5px;
    text-align: left;
  }
  .esc-seg:hover,
  .esc-seg:focus-visible {
    background: var(--st-semantic-surface-muted, rgba(100, 116, 139, 0.12));
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .esc-seg--on {
    border-color: var(--st-semantic-border-strong, #94a3b8);
    background: var(--st-semantic-surface-muted, rgba(100, 116, 139, 0.16));
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .esc-svg--solo {
    color: inherit;
  }
</style>
