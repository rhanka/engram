/**
 * Module shims for optional runtime deps so the DTS build does not require
 * them to be installed in environments that opt out of optionalDependencies
 * (CI matrix, --omit=optional, etc.). Each module is loaded at runtime via
 * `await import(...)`; this declaration is type-only and never emitted into
 * the runtime bundle. Real types ship with each package and override this
 * shim when the package is installed.
 */

declare module "officeparser" {
  export function parseOfficeAsync(
    file: string,
    config?: { ocr?: boolean; outputErrorToConsole?: boolean; newlineDelimiter?: string },
  ): Promise<string>;
}

declare module "unpdf" {
  export interface UnpdfTextResult {
    text: string | string[];
    totalPages: number;
  }
  export function getDocumentProxy(data: Uint8Array): Promise<unknown>;
  export function extractText(
    doc: unknown,
    options?: { mergePages?: boolean },
  ): Promise<UnpdfTextResult>;
}

declare module "@sentropic/design-system/tokens" {
  import type { WorkspaceThemedTokens } from "../workspace/tokens.js";
  export const workspaceTokens: WorkspaceThemedTokens;
  const defaultTokens: WorkspaceThemedTokens;
  export default defaultTokens;
}

declare module "@sentropic/agent-stats-core" {
  export const VERSION: string;
  export function collect(opts?: unknown): AsyncGenerator<unknown, void, unknown>;
  export function aggregateSessions(events: AsyncIterable<unknown> | Iterable<unknown>): Promise<unknown[]>;
}
