import type { NativeScalarSchema } from "./ontology-guardian/diagram-native-types.js";

export const DATA_MODEL_FORMAT = "engram.data-model/1";

export interface ModelHeader {
  format: typeof DATA_MODEL_FORMAT;
  enums?: Record<string, Extract<NativeScalarSchema, { kind: "enum" }>>;
}
