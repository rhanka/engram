// Public subpath @sentropic/engram/archi — archi@1 + archi-cards@1 semantic checks, slot projection,
// DS fold summaries, view checks V1–V5 and governed pins (spec/SPEC_EVOL_ARCHI_CARDS.md §2–§5).
export {
  ARCHI1_DECLARATION,
  ARCHI1_TUPLES,
  ARCHI_CORPUS_DIGEST,
  ARCHI_CORPUS_FIXTURES,
  ARCHI_CORPUS_REF,
  ARCHI_V1,
  ARCHI_V1_PIN,
  ENVELOPE_ARCHI_V1,
  PAYLOAD_ARCHI_V1,
  RECORD_ARCHI_V1,
} from "./ontology-guardian/archi-profile.js";

export {
  checkArchi,
  type ArchiLanguage,
  type ArchiVerbCards,
  type ArchiVerbKey,
  type ArchiVerbTable,
} from "./ontology-guardian/archi-check.js";

export {
  ARCHI_FONT_METRICS,
  ARCHI_FONT_METRICS_SHA256,
  layoutArchiLines,
  measureArchiKicker,
  measureArchiText,
  type ArchiFontMetricBucket,
  type ArchiFontMetricsTable,
  type ArchiMeasuredSlotName,
  type ArchiMetricBucketName,
  type ArchiSlotMeasurement,
} from "./ontology-guardian/archi-metrics.js";

export {
  ARCHI_CARDS_ALLOCATION,
  ARCHI_CARDS_CONTENT,
  ARCHI_CARDS_CONTENT_DIGEST,
  ARCHI_CARDS_DESCRIPTOR,
  ARCHI_CARDS_DETAIL,
  ARCHI_CARDS_ICONS,
  ARCHI_CARDS_LABELS,
  ARCHI_CARDS_PIN,
  ARCHI_CARDS_SCHEMA_V1,
  ARCHI_LINE_RULE,
  ARCHI_STATUS_ORDER,
  ARCHI_VERB_ORDER,
  ENVELOPE_ARCHI_CARDS_V1,
  PAYLOAD_ARCHI_CARDS_V1,
  RECORD_ARCHI_CARDS_V1,
  type ArchiAllocationTable,
  type ArchiCardKind,
  type ArchiCardsContent,
  type ArchiContainerKind,
  type ArchiDetailRule,
  type ArchiIconName,
  type ArchiKind,
  type ArchiLanguageLabels,
  type ArchiLifecycle,
  type ArchiSlotAllocation,
} from "./ontology-guardian/archi-cards-data.js";

export {
  ARCHI_CONTAINER_KINDS,
  archiPlacement,
  archiRelationEncoding,
  buildArchiSemanticModel,
  legendKeys,
  markArchiStatus,
  projectArchiCards,
  worstArchiLifecycle,
  type ArchiActiveHierarchy,
  type ArchiCardsProjectionResult,
  type ArchiDiagramPresentation,
  type ArchiEntityTextSlots,
  type ArchiOccurrenceMeasures,
  type ArchiPresentationEntity,
  type ArchiProjectionBinding,
  type ArchiSemanticModel,
  type ArchiViewMeasures,
} from "./ontology-guardian/archi-cards.js";

export {
  archiGroupId,
  archiOccurrenceRef,
  archiSummaries,
  buildArchiSourceView,
  checkArchiView,
  type ArchiDsPort,
  type ArchiSummaryDefinition,
  type ArchiViewSpec,
  type ArchiViewSpecLegend,
  type ArchiViewSpecLegendToken,
} from "./ontology-guardian/archi-view.js";

export type { EngramDiagnostic } from "./ontology-guardian/diagnostics.js";
export type {
  NativeDiagramPresentation,
  NativeEntityOccurrence,
  NativeGeometry,
  NativeOccurrenceEndpoint,
  NativePresentationState,
  NativePresentationText,
  NativeSemanticDocument,
  NativeViewDocument,
} from "./ontology-guardian/diagram-native-types.js";
export { GENERIC_V2 } from "./ontology-guardian/diagram-profiles.js";
export { CONTRACT_PIN } from "./ontology-guardian/diagram-registry.js";
export type { Digest, Pin } from "./ontology-guardian/types.js";
