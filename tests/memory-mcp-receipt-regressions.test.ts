import { describe, expect, it } from 'vitest';
import {
  MEMORY_PUBLISHER_ASSETS_V1_SCHEMA,
  validateMemoryCandidateTupleV1,
  validateMemoryQualifiedTupleV1,
  validatePublishedJsonSchemaDraft202012,
} from '../src/mcp/memory/index.js';
import { candidateTuple } from './fixtures/memory-mcp-sol-rules.js';

describe('L0-A01/A09 receipt corrections (M7, M11)', () => {
  const tupleWithVersion = (packageVersion: string) => ({
    ...candidateTuple, artifacts: [{ ...candidateTuple.artifacts[0], packageVersion }],
  });
  it.each(['01.0.0', '1.0.0-01', '1.0.0-a..b', '1.0.0+01..b', '1.0.0\n'])('should reject malformed receipt SemVer %j', version => {
    expect(validateMemoryCandidateTupleV1(tupleWithVersion(version)).ok).toBe(false);
    for (const schema of [MEMORY_PUBLISHER_ASSETS_V1_SCHEMA.properties.entryVersion, MEMORY_PUBLISHER_ASSETS_V1_SCHEMA.properties.manifestVersion]) {
      expect(validatePublishedJsonSchemaDraft202012(schema as Record<string, unknown>, version).ok).toBe(false);
    }
  });
  it.each(['0.0.0', '1.2.3-0', '1.2.3-alpha.1', '1.2.3-01a', '1.2.3+001.build'])('should preserve exact valid receipt SemVer %j', version => {
    expect(validateMemoryCandidateTupleV1(tupleWithVersion(version)).ok).toBe(true);
  });

  it('should compare source and artifact members independently of insertion order', () => {
    const { head, base, merge, checkout } = candidateTuple.source;
    const { packageName, packageVersion, tarballSha256, integrity } = candidateTuple.artifacts[0];
    expect(validateMemoryQualifiedTupleV1(candidateTuple, {
      ...candidateTuple, source: { checkout, merge, base, head },
      artifacts: [{ integrity, tarballSha256, packageVersion, packageName }],
    }).ok).toBe(true);
  });

  it('should retain source values, hash bytes and artifact array order in qualification identity', () => {
    expect(validateMemoryQualifiedTupleV1(candidateTuple, { ...candidateTuple, source: { ...candidateTuple.source, head: 'changed' } }).ok).toBe(false);
    expect(validateMemoryQualifiedTupleV1(candidateTuple, { ...candidateTuple, profileSha256: '0'.repeat(64) }).ok).toBe(false);
    const first = candidateTuple.artifacts[0];
    const second = { ...first, packageName: '@sentropic/l5' };
    expect(validateMemoryQualifiedTupleV1({ ...candidateTuple, artifacts: [first, second] }, { ...candidateTuple, artifacts: [second, first] }).ok).toBe(false);
    expect(validateMemoryQualifiedTupleV1(candidateTuple, { ...candidateTuple, artifacts: [{ ...first, tarballSha256: '0'.repeat(64) }] }).ok).toBe(false);
  });
});
