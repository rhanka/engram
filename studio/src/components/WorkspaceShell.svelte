<script>
  /**
   * Three-column workspace shell: left rail / center graph / right entity panel.
   * Mirrors the process-std-am WorkspaceShell slot contract (left + graph), extended
   * with a `right` slot for the entity panel (the PROCESS_STD "Track B slot").
   */
  let { children } = $props();
</script>

<div class="ws-shell">
  {@render children()}
</div>

<style>
  .ws-shell {
    display: grid;
    /* Left rail column is FIXED-width (not minmax): a content-sized column
       changes width when a rail menu expands/collapses, which resizes the
       center graph canvas and shifts the rendered graph by a few px. */
    grid-template-columns: 20rem minmax(0, 1fr) minmax(18rem, 24rem);
    gap: 1px;
    height: 100%;
    min-height: 0;
    background: var(--st-semantic-border-subtle, #e2e8f0);
  }

  @media (max-width: 1080px) {
    .ws-shell {
      grid-template-columns: minmax(0, 1fr);
      grid-auto-rows: min-content;
      height: auto;
    }
  }
</style>
