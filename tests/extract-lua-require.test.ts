import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { __testing } from "../src/extract.js";

const { resolveLuaImportTarget } = __testing;

/**
 * Track F-0819-P1 (upstream #1075): a Lua require() target must resolve to the
 * real file node id (so the import edge lands on a node), not the bare last
 * dotted segment (which never matched any node and silently dropped the edge).
 */
describe("F-0819-P1 #1075 — Lua require() target resolution", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-lua-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("resolves a dotted module to the on-disk file node id", () => {
    // require("pkg.b") from <dir>/main.lua should find <dir>/pkg/b.lua
    mkdirSync(join(dir, "pkg"), { recursive: true });
    writeFileSync(join(dir, "pkg", "b.lua"), "return {}\n");
    const main = join(dir, "main.lua");
    writeFileSync(main, 'local b = require("pkg.b")\n');

    const target = resolveLuaImportTarget("pkg.b", main);
    // qualifiedFileStem(pkg/b.lua) -> "pkg.b" -> _makeId -> "pkg_b"
    expect(target).toBe("pkg_b");
    // crucially NOT the bare last segment "b"
    expect(target).not.toBe("b");
  });

  it("falls back to the full dotted module id when no file matches on disk", () => {
    const main = join(dir, "main.lua");
    writeFileSync(main, 'local x = require("third.party.lib")\n');
    const target = resolveLuaImportTarget("third.party.lib", main);
    // fallback: _makeId of the full dotted module (underscored), not bare "lib"
    expect(target).toBe("third_party_lib");
    expect(target).not.toBe("lib");
  });
});
