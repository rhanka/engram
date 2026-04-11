export type NumericMapLike<T> = Map<number, T> | Record<number | string, T>;
export type StringMapLike<T> = Map<string, T> | Record<string, T>;

export function toNumericMap<T>(
  value: NumericMapLike<T> | null | undefined,
): Map<number, T> {
  if (value instanceof Map) return value;

  const map = new Map<number, T>();
  if (!value) return map;

  for (const [key, entry] of Object.entries(value)) {
    const numericKey = Number(key);
    if (Number.isFinite(numericKey)) {
      map.set(numericKey, entry as T);
    }
  }

  return map;
}

export function toStringMap<T>(
  value: StringMapLike<T> | null | undefined,
): Map<string, T> {
  if (value instanceof Map) return value;

  const map = new Map<string, T>();
  if (!value) return map;

  for (const [key, entry] of Object.entries(value)) {
    map.set(key, entry as T);
  }

  return map;
}
