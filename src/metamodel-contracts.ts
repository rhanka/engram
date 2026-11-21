/** "sha256:" + 64 lowercase hex characters over UTF-8 RFC 8785 (JCS) canonical bytes (/^sha256:[0-9a-f]{64}$/). */
export type Sha256Digest = `sha256:${string}`;

export type MetamodelVersion = "engram.metamodel/legacy-v0" | "engram.metamodel/v1";
export type LineageId = "archi" | "h2a" | "track" | "engram";

export interface OntologyTemplateEnvelopeRef {
  readonly lineage: LineageId;
  readonly templateId: string;
  readonly templateVersion: string; // Exact SemVer (e.g. "1.0.0")
  readonly templateDigestSha256: Sha256Digest; // Semantic contentDigest over RFC 8785 JCS bytes
}

export interface CrossLineageCompositionPin extends OntologyTemplateEnvelopeRef {
  readonly importAlias: string; // Local prefix used in endpoint refs, e.g. "archi_v2" -> "archi_v2:capability"
}

/** Signed h2a mandate envelope verified at lineage registration and boundary gates. */
export interface H2AMandateEnvelope {
  readonly mandateId: string;
  readonly instance: string;
  readonly role: "PRINCIPAL" | "EXECUTIF" | "CONDUCTOR" | "AGENTS" | "CONTROL" | "MANDATAIRE" | null;
  readonly scope: string;
  readonly rights: readonly string[];
  readonly expiresAt?: string;
  readonly envelopeDigest: Sha256Digest;
  readonly signatures: ReadonlyArray<{
    readonly by: string;
    readonly alg: string;
    readonly value: string;
  }>;
}
