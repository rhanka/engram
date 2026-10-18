import { describe, expect, it } from 'vitest';
import {
  validateMemoryHostBindingSetV1,
  validateMemoryLocalParametersV1,
} from '../src/mcp/memory/index.js';
import { validBindings } from './fixtures/memory-mcp-sol-rules.js';

describe('L0-A02 closed data shells (A02:1633)', () => {
  const parameters = { mode: 'embedded-local', hostBindingRef: 'host_01' };
  it('should reject inherited required parameters and non-plain parameter shells', () => {
    expect(validateMemoryLocalParametersV1(Object.create(parameters)).ok).toBe(false);
    expect(validateMemoryLocalParametersV1(new (class { mode = 'embedded-local'; hostBindingRef = 'host_01'; })()).ok).toBe(false);
    for (const missing of ['mode', 'hostBindingRef']) {
      const partial: Record<string, unknown> = { ...parameters };
      delete partial[missing];
      expect(validateMemoryLocalParametersV1(partial).ok).toBe(false);
    }
  });

  it('should reject inherited or unlisted binding shell fields', () => {
    expect(validateMemoryHostBindingSetV1(Object.create(validBindings)).ok).toBe(false);
    expect(validateMemoryHostBindingSetV1({ ...validBindings, unexpected: 'extra' }).ok).toBe(false);
    expect(validateMemoryHostBindingSetV1({ ...validBindings, [Symbol('extra')]: true }).ok).toBe(false);
    for (const missing of ['profileBindings', 'hostBindingRef', 'invocation', 'authorization', 'domainPolicy', 'engine', 'mutationRecovery', 'confirmation', 'audit', 'pagination', 'lifecycle']) {
      const partial: Record<string, unknown> = { ...validBindings };
      delete partial[missing];
      expect(validateMemoryHostBindingSetV1(partial).ok).toBe(false);
    }
  });

  it('should admit ordinary and null-prototype shells with valid own fields', () => {
    for (const value of [parameters, Object.assign(Object.create(null), parameters)]) {
      expect(validateMemoryLocalParametersV1(value).ok).toBe(true);
    }
    for (const value of [validBindings, Object.assign(Object.create(null), validBindings)]) {
      expect(validateMemoryHostBindingSetV1(value).ok).toBe(true);
    }
  });

  it('should preserve injected implementation methods inside the closed binding shell', () => {
    class AuthorizationPort {
      readonly contractVersion = '1.0.0';
      authorize() { return true; }
    }
    expect(validateMemoryHostBindingSetV1({
      ...validBindings, authorization: new AuthorizationPort(),
      diagnostics: { grantsAuthority: false, inspect() { return 'ready'; } },
    }).ok).toBe(true);
  });
});
