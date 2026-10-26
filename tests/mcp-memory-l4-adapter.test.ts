import { expect, it } from 'vitest';
import type { AppConnectorProviderAdapter } from '@sentropic/mcp-platform/memory';
import {
  createEngramMemoryProviderV1,
  McpMemoryPreflightError,
  type McpMemoryProviderOptions,
} from '../src/mcp-memory/provider.js';

const options = null as unknown as McpMemoryProviderOptions;

it('MCP-L4 adapter satisfies the standard provider contract', () => {
  // Compile-time proof: the factory result is assignable to the Sentropic
  // P2 AppConnectorProviderAdapter with no custom interface in between. The
  // factory is not invoked here (null options fail preflight by design);
  // runtime behavior is proven by the pipeline suite and packed acceptance.
  const build = (): AppConnectorProviderAdapter => createEngramMemoryProviderV1(options);
  expect(typeof build).toBe('function');
  expect(typeof createEngramMemoryProviderV1).toBe('function');
  expect(typeof McpMemoryPreflightError).toBe('function');
});

it.each([
  ['missing options', undefined],
  ['empty options', {}],
  ['empty facets and hosts', { readFacets: {}, writeFacets: {}, readHost: {}, writeHost: {}, policyId: 'policy:one' }],
  ['empty policy id', { readFacets: {}, writeFacets: {}, readHost: {}, writeHost: {}, policyId: '' }],
  ['missing host bindings', { readFacets: {}, writeFacets: {}, readHost: {}, writeHost: {}, policyId: 'policy:one' }],
  ['missing compiled plan', { readFacets: {}, writeFacets: {}, readHost: {}, writeHost: {}, policyId: 'policy:one', hostBindings: {} }],
  ['missing source and generation', { readFacets: {}, writeFacets: {}, readHost: {}, writeHost: {}, policyId: 'policy:one', hostBindings: {}, plan: {} }],
])('MCP-L4 activation preflight refuses %s with a typed refusal', async (_label, bad) => {
  await expect(async () => createEngramMemoryProviderV1(bad as McpMemoryProviderOptions)).rejects.toBeInstanceOf(
    McpMemoryPreflightError,
  );
});
