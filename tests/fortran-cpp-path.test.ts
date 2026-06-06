import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract } from "../src/extract.js";

/**
 * Track F-0831-P1 (F5). Upstream safishamsi/graphify 46a1d4c hardens a Python
 * C-preprocessor call (`cpp ... <path>`) by passing an absolute path, because
 * cpp has no `--` end-of-options terminator and an attacker-named corpus file
 * like `-I/etc/x.F90` could be parsed as a cpp option.
 *
 * The TS fork has NO equivalent surface: Fortran is regex-backed and read with
 * readFileSync inside extractRegexBackedCode — no `cpp`/subprocess is ever
 * invoked. This test is a non-regression guard proving a hostile filename still
 * extracts cleanly (and never shells out).
 */
describe("Fortran extraction has no cpp/subprocess surface (F5)", () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `fortran-f5-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("extracts a Fortran file whose name looks like a cpp option", async () => {
    // A filename an attacker could craft to be parsed as a `cpp` option if it
    // were ever passed unquoted to a preprocessor.
    const hostile = join(dir, "-I-etc-evil.f90");
    writeFileSync(
      hostile,
      [
        "module geometry",
        "contains",
        "  subroutine area(r)",
        "    real :: r",
        "  end subroutine area",
        "  function perimeter(r)",
        "    real :: r, perimeter",
        "  end function perimeter",
        "end module geometry",
      ].join("\n"),
    );

    const result = await extract([hostile]);
    const labels = result.nodes.map((n) => n.label);
    // Regex extractor must have read the file and produced its symbols.
    expect(labels).toContain("area()");
    expect(labels).toContain("perimeter()");
  });
});
