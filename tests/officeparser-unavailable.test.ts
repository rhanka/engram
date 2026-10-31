import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import {
  OFFICE_EXTRACTION_UNAVAILABLE,
  docxToMarkdown,
  officeParseToText,
  xlsxToMarkdown,
  type ImportOfficeparser,
} from "../src/detect.js";

// Absent-module path: officeparser is an optional peer dependency, so a
// consumer tree may legitimately have no `officeparser` installed. Mock the
// import failure with Node's exact ERR_MODULE_NOT_FOUND rejection; the code
// under test must surface the typed OFFICE_EXTRACTION_UNAVAILABLE outcome
// and never crash.
const missingEsm: ImportOfficeparser = () =>
  Promise.reject(
    Object.assign(
      new Error("Cannot find package 'officeparser' imported from src/detect.ts"),
      { code: "ERR_MODULE_NOT_FOUND" },
    ),
  );

// Minimal in-memory ZIP writer (same technique as office-guard.test.ts) so
// .docx/.xlsx fixtures pass the zip caps and reach the officeparser import.
function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf-8");
    const body = deflateRawSync(e.data);
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(8, 8);
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt32LE(0, 20); // uncompressed size placeholder (not validated by the guard)
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt32LE(offset, 42);
    locals.push(lfh, nameBuf, body);
    centrals.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + body.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centrals.length, 8);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

describe("officeparser absent (optional peer dependency)", () => {
  const dir = mkdtempSync(join(tmpdir(), "officeparser-missing-"));
  const zip = () => buildZip([{ name: "word/document.xml", data: Buffer.from("<doc/>") }]);

  it("officeParseToText yields the typed unavailable outcome, not a crash", async () => {
    const p = join(dir, "doc.docx");
    writeFileSync(p, zip());
    const result = await officeParseToText(p, missingEsm);
    expect(result).toEqual({
      status: "unavailable",
      message: OFFICE_EXTRACTION_UNAVAILABLE,
    });
    expect(result).toEqual({
      status: "unavailable",
      message: "office extraction unavailable: install officeparser",
    });
  });

  it("the CJS MODULE_NOT_FOUND flavour is also the unavailable outcome", async () => {
    const p = join(dir, "cjs.docx");
    writeFileSync(p, zip());
    const missingCjs: ImportOfficeparser = () =>
      Promise.reject(
        Object.assign(new Error("Cannot find module 'officeparser'"), {
          code: "MODULE_NOT_FOUND",
        }),
      );
    expect(await officeParseToText(p, missingCjs)).toEqual({
      status: "unavailable",
      message: OFFICE_EXTRACTION_UNAVAILABLE,
    });
  });

  it("docxToMarkdown returns '' when officeparser is missing", async () => {
    const p = join(dir, "note.docx");
    writeFileSync(p, zip());
    expect(await docxToMarkdown(p, missingEsm)).toBe("");
  });

  it("xlsxToMarkdown returns '' when officeparser is missing", async () => {
    const p = join(dir, "sheet.xlsx");
    writeFileSync(p, buildZip([{ name: "xl/workbook.xml", data: Buffer.from("<wb/>") }]));
    expect(await xlsxToMarkdown(p, missingEsm)).toBe("");
  });

  it("a MODULE_NOT_FOUND for another package is an error, not unavailable", async () => {
    // officeparser is present but one of its own imports is broken: the
    // missing specifier is not officeparser, so this is a parse-infrastructure
    // failure, not an absent-module case.
    const p = join(dir, "broken-dep.docx");
    writeFileSync(p, zip());
    const brokenInternalDep: ImportOfficeparser = () =>
      Promise.reject(
        Object.assign(
          new Error("Cannot find package 'jszip' imported from /node_modules/officeparser/dist/index.js"),
          { code: "ERR_MODULE_NOT_FOUND" },
        ),
      );
    expect(await officeParseToText(p, brokenInternalDep)).toEqual({ status: "error" });
  });

  it("a non-module error inside officeparser is an error outcome", async () => {
    const p = join(dir, "corrupt.docx");
    writeFileSync(p, zip());
    const failingParse: ImportOfficeparser = () =>
      Promise.reject(new Error("corrupt zip entry"));
    expect(await officeParseToText(p, failingParse)).toEqual({ status: "error" });
    expect(await docxToMarkdown(p, failingParse)).toBe("");
  });

  it("an installed officeparser keeps the ok path and text extraction intact", async () => {
    const p = join(dir, "present.docx");
    writeFileSync(p, zip());
    const present: ImportOfficeparser = async () => ({
      parseOfficeAsync: async () => "  extracted office text  ",
    });
    expect(await officeParseToText(p, present)).toEqual({
      status: "ok",
      text: "  extracted office text  ",
    });
    expect(await docxToMarkdown(p, present)).toBe("extracted office text");
    expect(await xlsxToMarkdown(p, present)).toBe("extracted office text");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});
