// Test-host driver lookup only; imports no memory store or graph consumer.
export function loadSqliteTestDriver() {
  return import("../../engram-memory/node_modules/better-sqlite3/lib/index.js");
}
