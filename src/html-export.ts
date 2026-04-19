import { existsSync, unlinkSync } from "node:fs";
import type Graph from "graphology";
import { toHtml } from "./export.js";

type ToHtmlOptions = Parameters<typeof toHtml>[3];
type HtmlWriter = typeof toHtml;

interface SafeToHtmlOptions {
  onWarning?: (message: string) => void;
  writer?: HtmlWriter;
}

export function safeToHtml(
  graph: Graph,
  communities: Map<number, string[]>,
  outputPath: string,
  options?: ToHtmlOptions,
  safeOptions?: SafeToHtmlOptions,
): string | undefined {
  const writer = safeOptions?.writer ?? toHtml;
  try {
    writer(graph, communities, outputPath, options);
    return outputPath;
  } catch (error) {
    if (existsSync(outputPath)) {
      try {
        unlinkSync(outputPath);
      } catch {
        // Best effort: stale HTML removal must not hide the original export failure.
      }
    }
    const message = `HTML export skipped: ${error instanceof Error ? error.message : String(error)}`;
    safeOptions?.onWarning?.(message);
    return undefined;
  }
}
