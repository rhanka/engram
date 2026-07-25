/**
 * Rail rows are ONE LINE: a long label truncates with an ellipsis instead of
 * wrapping into a multi-line column that pushes the whole subtree down. The
 * clipped text must stay reachable, so every truncating row carries its FULL
 * text in a native hover tooltip.
 *
 * A `SelectableRow` renders its label from a snippet, so a row can simply wrap
 * it in `<span title={…}>` — the convention the rail already uses for entity
 * and community labels. A DS `Collapsible` cannot: it takes its label as the
 * `title` STRING prop, renders it into its own `.st-collapsible__title` span,
 * and its props type explicitly omits `title` from the `...rest` spread. That
 * span is the element that clips, and no prop reaches it — hence this action.
 *
 * Native `title` (rather than the DS `Tooltip` component) is deliberate: the
 * ontology rail mounts thousands of rows, and a portal/popper instance per row
 * would be a per-row cost for an affordance that is only ever used on hover.
 */

const TITLE_SELECTOR =
  ":scope > .st-collapsible > .st-collapsible__trigger .st-collapsible__title";

/**
 * Svelte action: stamp `text` as the native tooltip of the DS Collapsible title
 * span rendered inside `node`.
 *
 * Applied to the row's own wrapper (the `<li>`), it targets the DIRECT-child
 * Collapsible only, so a recursive tree never re-titles its descendants' rows.
 *
 * @param {HTMLElement} node wrapper holding a direct-child DS Collapsible
 * @param {string} text full, untruncated label
 */
export function collapsibleTitleTooltip(node, text) {
  const apply = (value) => {
    const target = node.querySelector(TITLE_SELECTOR);
    if (!target) return;
    if (value) target.setAttribute("title", value);
    else target.removeAttribute("title");
  };
  apply(text);
  return {
    update: apply,
    destroy() {
      const target = node.querySelector(TITLE_SELECTOR);
      target?.removeAttribute("title");
    },
  };
}
