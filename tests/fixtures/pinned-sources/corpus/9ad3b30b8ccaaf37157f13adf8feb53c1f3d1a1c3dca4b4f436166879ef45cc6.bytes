<script>
  import { IconButton } from '@sentropic/design-system-svelte';
  import { Plus, Minus } from '@lucide/svelte';
  let { collapsed, label } = $props();
</script>

<IconButton size="sm" variant="ghost" aria-label={label} aria-expanded={!collapsed}>
  {#if collapsed}<Plus size="var(--st-component-button-anatomy-density-sm-fontSize)" aria-hidden="true" />
  {:else}<Minus size="var(--st-component-button-anatomy-density-sm-fontSize)" aria-hidden="true" />{/if}
</IconButton>
