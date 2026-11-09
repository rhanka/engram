// Public subpath @sentropic/engram/archi — Focus surface for archi@1 + archi-cards@1
// (spec/SPEC_EVOL_ARCHI_CARDS.md §2–§5).
import { DIAGRAM_VIEW_SCHEMA_V2 } from "./ontology-guardian/diagram-schemas.js";
import type { Pin } from "./ontology-guardian/types.js";

export {
  ARCHI_DIAGNOSTIC_CODES,
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
  type ArchiOccurrenceRenderOptions,
  type ArchiPresentationEntity,
  type ArchiProjectionBinding,
  type ArchiRenderEntityTextSlots,
  type ArchiViewMeasures,
  type ArchiViewRenderOptions,
} from "./ontology-guardian/archi-cards.js";
export type { ArchiSlotMeasurement } from "./ontology-guardian/archi-metrics.js";
export {
  archiSummaries,
  buildArchiSourceView,
  checkArchiView,
  type ArchiDsPort,
  type ArchiLayoutGroup,
  type ArchiLayoutHints,
  type ArchiSummaryDefinition,
  type ArchiViewSpec,
  type ArchiViewSpecLegend,
  type ArchiViewSpecLegendToken,
} from "./ontology-guardian/archi-view.js";
export { canonicalBytes } from "./ontology-guardian/canonical.js";
export { GENERIC_V2, type GovernedProfile } from "./ontology-guardian/diagram-profiles.js";
export { CONTRACT_PIN } from "./ontology-guardian/diagram-registry.js";
export type { ArchiDsDiagnostic, EngramDiagnostic } from "./ontology-guardian/diagnostics.js";
export type { NativeSemanticDocument, NativeViewDocument } from "./ontology-guardian/diagram-native-types.js";
export type { Digest, Pin } from "./ontology-guardian/types.js";
export {
  ARCHI_MANIFEST_PATH,
  ARCHI_MMD_PATH,
  REQUIRED_ACCEPTANCE_KEYS,
  assertValidArchiDiagnosticEnvelope,
  checkArchiAcceptanceShape,
  checkArchiDocumentInvariants,
  checkArchiManifestShape,
  checkArchiSourceTriple,
  checkArchiViewBindingShape,
  checkArchiViewSpecShape,
  parseStrictIJson,
  toArchiDsDiagnostic,
  type ArchiAcceptance,
  type ArchiAcceptanceFileEntry,
  type ArchiAcceptanceSource,
  type ArchiIJsonParseResult,
  type ArchiRefusal,
  type ArchiRefusalScope,
  type ArchiSourceTripleInput,
  type ArchiStage,
  type ArchiViewBinding,
} from "./ontology-guardian/archi-shapes.js";
export {
  createAtomicArchiWriter,
  createGitReadAt,
  createMemoryArchiWriter,
  ingestArchitecture,
  verifyArchiBinding,
  verifyArchiViewBinding,
  type ArchiAccepted,
  type ArchiIngestDsPort,
  type ArchiIngestInput,
  type ArchiIngestPorts,
  type ArchiIngestionResult,
  type ArchiMemoryWriterPort,
  type ArchiReadAtPort,
  type ArchiVerifyBindingInput,
  type ArchiWriterPort,
} from "./ontology-guardian/archi-ingest.js";

export {
  ARCHI_ARCHIMATE_DIAGNOSTIC_CODES,
  ARCHI_ARCHIMATE_ELEMENT_TABLE,
  ARCHI_ARCHIMATE_PROPERTIES,
  ARCHI_ARCHIMATE_RELATIONSHIP_TABLE,
  archiAttributesOfArchimate,
  archiEntityTypeOfArchimate,
  archiRefOfArchimateId,
  archiRelationTypeOfArchimate,
  archiViewOfArchimateId,
  archimateElementOf,
  archimateIdOf,
  archimatePropertiesOf,
  archimateRelationshipOf,
  archimateViewIdOf,
  type ArchiArchimateDecodedRecord,
  type ArchiArchimateDiagnostic,
  type ArchiArchimateDiagnosticCode,
  type ArchiArchimateElementMapping,
  type ArchiArchimateElementRow,
  type ArchiArchimateFailureCode,
  type ArchiArchimatePropertyDef,
  type ArchiArchimateRelationReversed,
  type ArchiArchimateRelationshipMapping,
  type ArchiArchimateRelationshipRow,
  type ArchiArchimateResult,
  type ArchiArchimateViewState,
} from "./ontology-guardian/archi-archimate.js";

/** Governed diagram-view-schema@2 Pin carried by archi@1 bindings. */
export const VIEW_SCHEMA_V2_PIN: Pin = DIAGRAM_VIEW_SCHEMA_V2.pin;
