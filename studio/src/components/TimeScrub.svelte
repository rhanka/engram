<script>
  /**
   * TIME-SCRUB playback control (opt-in, 2D, additive). A slider + play/pause
   * over the scene's temporal range (#234 `t`, epoch-ms). Moving the cursor
   * FILTERS the displayed graph to elements with `t <= cursor` — the filtering
   * itself lives in graphAdapter.applyTimeFilter and flows through the SAME scene
   * → render path the weak-link / group-by filters use (no renderer API).
   *
   * Hides itself (renders nothing) when `range` is null — i.e. no node/edge in
   * the scene carries a `t`, so the control is a strict no-op on non-temporal
   * graphs. A null `cursor` is the OFF state (whole graph shown); the parent's
   * default cursor is null so the default view is unchanged.
   */
  let { range = null, cursor = null, onSetCursor } = $props();

  let playing = $state(false);

  // Playback divides the temporal span into ~STEPS frames advanced every TICK_MS.
  const STEPS = 60;
  const TICK_MS = 200;

  // The slider position: the cursor, or the span's max when OFF (cursor null) so
  // the initial, unfiltered view sits at "now" (everything visible).
  const value = $derived(range ? (cursor ?? range.max) : 0);
  const sliderStep = $derived(range ? (range.max - range.min) / 200 || 1 : 1);

  function nextCursor() {
    if (!range) return cursor;
    const inc = (range.max - range.min) / STEPS || 1;
    return Math.min(range.max, (cursor ?? range.min) + inc);
  }

  // Playback loop. The effect only re-subscribes on `playing` / `range`; the
  // interval reads the latest `cursor` via closure each tick, so updating the
  // parent state does not tear the timer down.
  $effect(() => {
    if (!playing || !range) return;
    const id = setInterval(() => {
      const next = nextCursor();
      onSetCursor?.(next);
      if (next >= range.max) playing = false;
    }, TICK_MS);
    return () => clearInterval(id);
  });

  function onInput(e) {
    playing = false;
    onSetCursor?.(Number(e.currentTarget.value));
  }

  function togglePlay() {
    if (!range) return;
    // Restart from the oldest instant when at / past the end.
    if ((cursor ?? range.max) >= range.max) onSetCursor?.(range.min);
    playing = !playing;
  }

  function reset() {
    playing = false;
    onSetCursor?.(null);
  }

  function fmt(ms) {
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : String(ms);
  }
</script>

{#if range}
  <div class="time-scrub">
    <div class="time-scrub-head">
      <span class="time-scrub-title">Time scrub</span>
      <span class="time-scrub-now">{cursor == null ? "all" : fmt(cursor)}</span>
    </div>
    <div class="time-scrub-row">
      <button
        type="button"
        class="time-scrub-btn"
        aria-pressed={playing}
        onclick={togglePlay}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        class="time-scrub-range"
        min={range.min}
        max={range.max}
        step={sliderStep}
        value={value}
        oninput={onInput}
        aria-label="Time cursor"
      />
      <button
        type="button"
        class="time-scrub-btn"
        disabled={cursor == null}
        onclick={reset}
      >
        Off
      </button>
    </div>
    <div class="time-scrub-bounds">
      <span>{fmt(range.min)}</span>
      <span>{fmt(range.max)}</span>
    </div>
  </div>
{/if}

<style>
  .time-scrub {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
    font-size: 12px;
  }
  .time-scrub-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .time-scrub-title {
    font-weight: 600;
  }
  .time-scrub-now {
    color: var(--st-semantic-text-subtle, #64748b);
    font-variant-numeric: tabular-nums;
  }
  .time-scrub-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .time-scrub-range {
    flex: 1 1 auto;
    min-width: 0;
  }
  .time-scrub-btn {
    flex: 0 0 auto;
    cursor: pointer;
  }
  .time-scrub-btn:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .time-scrub-bounds {
    display: flex;
    justify-content: space-between;
    color: var(--st-semantic-text-subtle, #64748b);
    font-variant-numeric: tabular-nums;
  }
</style>
