import { describe, expect, it } from 'vitest';
import {
  validateMemoryToolSchemaDialectV1 as admit,
  validatePublishedJsonSchemaDraft202012 as validate,
} from '../src/mcp/memory/index.js';

describe('L0-A04 supported schema shapes (M2:168, 400–401)', () => {
  it.each([
    { properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false },
    { type: 'float' },
    { type: 'string', pattern: '[' },
  ])('should refuse the reviewer counterexample at admission and evaluation: %j', schema => {
    expect(admit(schema).ok).toBe(false);
    expect(validate(schema, { a: 42 }).ok).toBe(false);
    expect(validate(schema, 'x').ok).toBe(false);
  });

  const malformed: Record<string, unknown>[] = [
    { type: ['string', 'integer'] }, { type: 'null' }, { type: undefined },
    { type: 'object', additionalProperties: true },
    { type: 'object', additionalProperties: false, properties: undefined },
    { type: 'object', additionalProperties: false, properties: [] },
    { type: 'object', additionalProperties: false, properties: { a: true } },
    ...[true, 'a', [1], ['a', 'a']].map(required => ({ type: 'object', additionalProperties: false, required })),
    ...['minimum', 'maximum'].flatMap(key => ['0', undefined, NaN, Infinity, -Infinity].map(value => ({ type: 'number', [key]: value }))),
    ...['minLength', 'maxLength', 'minItems', 'maxItems'].flatMap(key => [-1, 0.5, '1', undefined, NaN, Infinity].map(value => ({ type: key.endsWith('Items') ? 'array' : 'string', [key]: value }))),
    { type: 'array', uniqueItems: 'true' }, { type: 'array', items: false },
    { type: 'array', items: [] }, { type: 'string', pattern: 42 },
    { oneOf: [] }, { oneOf: [{ type: 'string' }, false] },
    ...['$id', 'title', 'description'].map(key => ({ [key]: 42 })),
  ];
  it.each(malformed)('should refuse malformed keyword values without throwing: %j', schema => {
    expect(admit(schema).ok).toBe(false);
    expect(validate(schema, 'value').ok).toBe(false);
  });

  it.each([
    ['properties', {}], ['required', ['a']], ['additionalProperties', false],
    ['items', { type: 'string' }], ['minItems', 1], ['maxItems', 1], ['uniqueItems', true],
    ['minLength', 1], ['maxLength', 1], ['pattern', '^x$'], ['minimum', 0], ['maximum', 1],
  ])('should refuse an assertion without its supported type: %s', (key, value) => {
    for (const type of [undefined, 'boolean']) {
      const schema = { ...(type ? { type } : {}), [key as string]: value };
      expect(admit(schema).ok).toBe(false);
      expect(validate(schema, true).ok).toBe(false);
    }
  });

  it('should preflight every nested branch before evaluating values', () => {
    for (const schema of [
      { type: 'array', items: { type: 'string', pattern: '[' } },
      { type: 'object', additionalProperties: false, properties: { a: { type: 'float' } } },
      { oneOf: [{ const: 'x' }, { type: 'number', minimum: '0' }] },
    ]) {
      expect(admit(schema).ok).toBe(false);
      expect(validate(schema, 'x').ok).toBe(false);
    }
  });

  it('should enforce all assertions in a supported nested union', () => {
    const schema = { oneOf: [
      { type: 'object', additionalProperties: false, required: ['a'], properties: {
        a: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 2 } },
      } },
      { type: 'string', minLength: 1, maxLength: 2, pattern: '^x+$' },
    ] };
    expect(admit(schema).ok).toBe(true);
    for (const value of [{ a: [0, 2] }, 'xx']) expect(validate(schema, value).ok).toBe(true);
    for (const value of [{}, { a: [0], extra: 1 }, { a: [] }, { a: [0, 1, 2] }, { a: [1, 1] }, { a: [-1] }, { a: [3] }, { a: [0.5] }, '', 'xxx', 'y', true]) {
      expect(validate(schema, value).ok, JSON.stringify(value)).toBe(false);
    }
    expect(validate({ oneOf: [{ type: 'string' }, { const: 'x' }] }, 'x').ok).toBe(false);
  });

  it.each([
    { enum: 'x' }, { enum: [] }, { enum: ['x', 'x'] },
    { enum: [{ a: 1, b: 2 }, { b: 2, a: 1 }] },
    ...[undefined, NaN, Infinity, 1n, () => 'x', Symbol('x'), new Date(), [undefined], { a: undefined }]
      .flatMap(value => [{ const: value }, { enum: [value] }, { default: value }]),
  ])('should refuse malformed enum, const and default values', schema => {
    expect(admit(schema).ok).toBe(false);
    expect(validate(schema, 'x').ok).toBe(false);
  });

  it('should reject cyclic schemas and sparse keyword arrays without throwing', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.default = cyclic;
    for (const schema of [cyclic, { enum: Array(1) }, { oneOf: Array(1) }, { type: 'object', additionalProperties: false, required: Array(1) }]) {
      expect(admit(schema).ok).toBe(false);
      expect(validate(schema, {}).ok).toBe(false);
    }
  });

  it('should apply JSON equality to composite const, enum and uniqueItems assertions', () => {
    for (const schema of [{ const: { a: [1, 2], b: true } }, { enum: [{ a: [1, 2], b: true }] }]) {
      expect(admit(schema).ok).toBe(true);
      expect(validate(schema, { b: true, a: [1, 2] }).ok).toBe(true);
      expect(validate(schema, { b: true, a: [2, 1] }).ok).toBe(false);
      expect(validate(schema, { b: false, a: [1, 2] }).ok).toBe(false);
    }
    const unique = { type: 'array', uniqueItems: true };
    expect(validate(unique, [{ a: 1, b: 2 }, { b: 2, a: 1 }]).ok).toBe(false);
    expect(validate(unique, [[1, 2], [2, 1]]).ok).toBe(true);
    expect(validate({ const: null }, null).ok).toBe(true);
    expect(validate({ const: 0 }, -0).ok).toBe(true);
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    for (const value of [undefined, NaN, cyclic, 1n]) expect(validate({}, value).ok).toBe(false);
  });

  it('should keep annotations inert and count Unicode characters in patterns', () => {
    const schema = { type: 'string', pattern: '^.$', minLength: 1, maxLength: 1, default: 'x', title: 's', description: 's' };
    expect(admit(schema).ok).toBe(true);
    expect(validate(schema, '😀').ok).toBe(true);
    expect(validate(schema, undefined).ok).toBe(false);
    expect(validate({}, { unchanged: 1 }).ok).toBe(true);
  });
});
