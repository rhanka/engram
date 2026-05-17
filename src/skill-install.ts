// Idempotent install-section helper.
//
// Ported from upstream PR #891 (`safishamsi/graphify`, v0.8.6). The pre-patch
// installers wrote a Markdown section only when the marker (e.g. `## graphify`)
// was absent, so existing users kept the old "read GRAPH_REPORT.md first"
// wording on disk forever. This helper overwrites the section in place when the
// marker is found and appends it otherwise, so `graphify <platform> install`
// can refresh stale guidance without losing surrounding custom sections.

/**
 * Replace the section starting at `marker` (an H2 line like `## graphify`)
 * up to the next `## ` H2 or end of file, or append the section if the marker
 * is not present.
 *
 * Behaviour:
 *   - If `content` is empty, returns `newSection` as-is.
 *   - If `marker` is not found, appends `newSection` after a blank line.
 *   - If `marker` is found, replaces from the marker line up to (but not
 *     including) the next `## ` H2 — or EOF — with `newSection`.
 *   - The returned content is normalised to end with a single trailing newline.
 *
 * The `marker` must match the start of a line (the leading `## ` H2 prefix
 * is the only convention recognised — sub-headings like `### foo` are kept).
 */
export function replaceOrAppendSection(
  content: string,
  marker: string,
  newSection: string,
): string {
  const trimmedSection = newSection.endsWith("\n") ? newSection : newSection + "\n";

  if (!content || content.trim().length === 0) {
    return trimmedSection;
  }

  const lines = content.split("\n");
  let markerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === marker || lines[i]?.startsWith(marker + "\n")) {
      markerIndex = i;
      break;
    }
    // Allow exact match when split leaves the marker as its own line.
    if (lines[i]?.trimEnd() === marker) {
      markerIndex = i;
      break;
    }
  }

  if (markerIndex === -1) {
    // Append a fresh section with one blank line of separation.
    const base = content.trimEnd();
    return base + "\n\n" + trimmedSection;
  }

  // Find the end of the section: next `## ` heading after the marker, or EOF.
  let endIndex = lines.length;
  for (let i = markerIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("## ")) {
      endIndex = i;
      break;
    }
  }

  const before = lines.slice(0, markerIndex).join("\n");
  const after = lines.slice(endIndex).join("\n");

  const sectionLines = trimmedSection.split("\n");
  // Drop trailing empty line created by the final newline so we can rebuild cleanly.
  if (sectionLines.length > 0 && sectionLines[sectionLines.length - 1] === "") {
    sectionLines.pop();
  }

  const rebuilt: string[] = [];
  if (before.length > 0) {
    rebuilt.push(before.replace(/\n+$/, ""));
    rebuilt.push("");
  }
  rebuilt.push(...sectionLines);

  let result = rebuilt.join("\n");
  if (after.trim().length > 0) {
    result = result.replace(/\n+$/, "") + "\n\n" + after.replace(/^\n+/, "").replace(/\n+$/, "") + "\n";
  } else {
    if (!result.endsWith("\n")) result += "\n";
  }
  return result;
}
