// Public subpath @sentropic/engram/archi — Focus surface for archi@1 + archi-cards@1
// (spec/SPEC_EVOL_ARCHI_CARDS.md §2–§5).
export {
  checkArchi,
  type ArchiDiagnosticCode,
  type ArchiLanguage,
  type ArchiManifest,
  type ArchiVerbCards,
} from "./ontology-guardian/archi-check.js";
export { ARCHI_V1, ARCHI_V1_PIN } from "./ontology-guardian/archi-profile.js";
export {
  ARCHI_CARDS_CONTENT,
  ARCHI_CARDS_PIN,
  type ArchiCardsContent,
} from "./ontology-guardian/archi-cards-data.js";
export {
  projectArchiCards,
  type ArchiActiveHierarchy,
  type ArchiCardsProjectionResult,
  type ArchiDiagramPresentation,
  type ArchiEntityTextSlots,
  type ArchiOccurrenceMeasures,
  type ArchiPresentationEntity,
  type ArchiProjectionBinding,
  type ArchiRenderEntityTextSlots,
  type ArchiViewMeasures,
} from "./ontology-guardian/archi-cards.js";
export type { ArchiSlotMeasurement } from "./ontology-guardian/archi-metrics.js";
export {
  archiSummaries,
  checkArchiView,
  type ArchiDsPort,
  type ArchiLayoutGroup,
  type ArchiLayoutHints,
  type ArchiSummaryDefinition,
  type ArchiViewSpec,
  type ArchiViewSpecLegend,
  type ArchiViewSpecLegendToken,
} from "./ontology-guardian/archi-view.js";
export {
  ARCHI_MERMAID_DIAGNOSTIC_CODES,
  ArchiMermaidError,
  canonical,
  fmt,
  parse,
  print,
  type ArchiMermaidDiagnosticCode,
  type ArchiMermaidFormatOptions,
  type ArchiMermaidParseOptions,
  type ArchiMermaidPrintOptions,
  type ArchiSourceTriple,
} from "./archi-mermaid/index.js";
export { GENERIC_V2, type GovernedProfile } from "./ontology-guardian/diagram-profiles.js";
export { CONTRACT_PIN } from "./ontology-guardian/diagram-registry.js";
export type { EngramDiagnostic } from "./ontology-guardian/diagnostics.js";
export type { NativeSemanticDocument, NativeViewDocument } from "./ontology-guardian/diagram-native-types.js";
export type { Digest, Pin } from "./ontology-guardian/types.js";
