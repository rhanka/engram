<script>
  /**
   * Per-entity 4-state VISIBILITY control (D6) — the row affordance that
   * SUPERSEDES the old group checkbox. At rest it shows the entity's current
   * state through the DS IconButton; on hover / focus / touch-tap it reveals a
   * four-item DS Menu overlay where any state is one click away.
   *
   *   Normal · Grouped · Hidden · Show only
   *
   * Absorbed rows (a type under a grouped parent) render the whole control
   * DISABLED. Wiring is a single `onSetState(key, nextState)` up to App's
   * `setEntityState` reducer.
   */
  import { IconButton, Menu } from "@sentropic/design-system-svelte";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Layers from "@lucide/svelte/icons/layers";
  import Target from "@lucide/svelte/icons/target";

  let {
    key,
    label = "",
    // The DISPLAYED state (displayedEntityState). Aliased to `entityState` locally
    // so the `$state` rune is never shadowed by a prop called `state`.
    state: entityState = "normal",
    disabled = false,
    // When absorbed by a grouped parent, the parent's label (for the tooltip).
    absorbedBy = null,
    // Dim the at-rest icon while a Solo is active elsewhere (this row is masked out).
    dim = false,
    onSetState,
  } = $props();

  const STATE_ITEMS = [
    { value: "normal", label: "Normal", icon: Eye },
    { value: "grouped", label: "Grouped", icon: Layers },
    { value: "hidden", label: "Hidden", icon: EyeOff },
    { value: "solo", label: "Show only", icon: Target },
  ];

  const STATE_ICONS = Object.fromEntries(STATE_ITEMS.map((item) => [item.value, item.icon]));

  let open = $state(false);
  let hovering = $state(false);
  let focused = $state(false);
  let closeTimer = null;
  let host;

  $effect(() => {
    if (disabled) open = false;
  });

  $effect(() => () => cancelClose());

  const currentLabel = $derived(
    STATE_ITEMS.find((item) => item.value === entityState)?.label ?? "Normal",
  );
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
    cancelClose();
    if (disabled) return;
    open = true;
  }

  function cancelClose() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      maybeClose();
    }, 180);
  }

  function maybeClose() {
    if (!hovering && !focused) open = false;
  }

  function onEnter() {
    cancelClose();
    hovering = true;
    reveal();
  }

  function onLeave() {
    hovering = false;
    scheduleClose();
  }

  function onFocusIn() {
    cancelClose();
    focused = true;
    reveal();
  }

  function onFocusOut() {
    focused = false;
    scheduleClose();
  }

  function onWindowKeydown(event) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    cancelClose();
    open = false;
  }

  function onWindowPointerDown(event) {
    if (!open) return;
    const target = event.target;
    if (host && target && !host.contains(target)) {
      cancelClose();
      open = false;
    }
  }

  function select(next, event) {
    event?.stopPropagation?.();
    if (disabled || typeof key !== "string") return;
    onSetState?.(key, next);
    cancelClose();
    open = false;
  }
</script>

{#snippet stateIcon(value)}
  {@const Icon = STATE_ICONS[value] ?? Eye}
  <Icon size={16} strokeWidth={2} aria-hidden="true" />
{/snippet}

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerDown} />

<div
  bind:this={host}
  class="esc"
  class:esc--dim={dim && entityState === "normal"}
  role="group"
  aria-label={`Visibility control: ${label}`}
  onpointerenter={onEnter}
  onpointerleave={onLeave}
  onfocusin={onFocusIn}
  onfocusout={onFocusOut}
>
  <IconButton
    size="sm"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={`Visibility: ${label} — ${currentLabel}`}
    title={glyphTitle}
    disabled={disabled}
    onclick={toggleOpen}
  >
    {@render stateIcon(entityState)}
  </IconButton>

  <div class="esc-menu-anchor">
    {#if open}
      <Menu
        label={`Visibility for ${label}`}
        items={STATE_ITEMS}
        dense
        dismissOnSelect={false}
        onselect={(value) => select(value)}
      />
    {/if}
  </div>
</div>

<style>
  .esc {
    display: inline-flex;
    position: relative;
    align-items: center;
    flex-shrink: 0;
  }

  .esc :global(.st-iconButton) {
    color: var(--st-component-iconButton-text, var(--st-semantic-text-secondary));
  }

  /* While a Solo is active elsewhere, a masked-out Normal row reads dimmer. */
  .esc--dim :global(.st-iconButton) {
    opacity: 0.45;
  }

  /* Keep the DS Menu out of the rail's flow, matching OverflowMenu's overlay. */
  .esc-menu-anchor {
    position: absolute;
    z-index: var(--st-component-popover-zIndex, 80);
    top: 100%;
    left: 0;
    padding-top: 6px;
  }
</style>
