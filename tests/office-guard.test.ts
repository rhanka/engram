import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";
import {
  fileWithinSizeCap,
  zipWithinCaps,
  OFFICE_MAX_RAW_BYTES,
  OFFICE_MAX_DECOMPRESSED_BYTES,
} from "../src/office-guard.js";
import { extractPdfText, docxToMarkdown, xlsxToMarkdown } from "../src/detect.js";

// Minimal in-memory ZIP writer so we can build a legitimate archive and a
// zip-bomb without pulling a zip dependency into the test. Single entry,
// deflate or stored, no data descriptor.
function buildZip(entries: { name: string; data: Buffer; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf-8");
    const method = e.store ? 0 : 8;
    const body = e.store ? e.data : deflateRawSync(e.data);
    const crc = 0; // not validated by our guard
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(e.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    const localOffset = offset;
    locals.push(lfh, nameBuf, body);
    offset += lfh.length + nameBuf.length + body.length;

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(e.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt32LE(localOffset, 42);
    centrals.push(cdh, nameBuf);
  }
  const cdStart = offset;
  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

describe("office-guard (F-0831-P1 / F2 zip-bomb)", () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `office-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a small legitimate office-style zip", () => {
    const p = join(dir, "ok.docx");
    writeFileSync(p, buildZip([{ name: "word/document.xml", data: Buffer.from("<x>hello world</x>") }]));
    expect(zipWithinCaps(p)).toBe(true);
  });

  it("rejects a zip-bomb whose member decompresses past the cap", () => {
    // A single member that inflates well past the 512 MiB ceiling from a tiny
    // highly-compressible payload (classic zip-bomb shape).
    const p = join(dir, "bomb.xlsx");
    const huge = Buffer.alloc(OFFICE_MAX_DECOMPRESSED_BYTES + 1024 * 1024, 0);
    writeFileSync(p, buildZip([{ name: "xl/sheet.xml", data: huge }]));
    expect(zipWithinCaps(p)).toBe(false);
  }, 120_000);

  it("rejects a member that under-declares its size (header lies)", () => {
    // Build a real zip-bomb, then corrupt the central-directory uncompressed
    // size to look tiny. The authoritative inflate pass must still catch it.
    const p = join(dir, "liar.docx");
    const huge = Buffer.alloc(OFFICE_MAX_DECOMPRESSED_BYTES + 1024 * 1024, 0);
    const zip = buildZip([{ name: "word/document.xml", data: huge }]);
    // Falsify both local + central uncompressed-size fields to 10 bytes.
    // Find the EOCD to locate the central directory.
    const eocd = zip.length - 22;
    const cdStart = zip.readUInt32LE(eocd + 16);
    zip.writeUInt32LE(10, cdStart + 24); // central uncompressed size
    zip.writeUInt32LE(10, 22); // local header uncompressed size
    writeFileSync(p, zip);
    expect(zipWithinCaps(p)).toBe(false);
  }, 120_000);

  it("rejects a file over the on-disk raw byte cap before parsing", () => {
    const p = join(dir, "fat.xlsx");
    writeFileSync(p, Buffer.alloc(OFFICE_MAX_RAW_BYTES + 1, 0x50));
    expect(zipWithinCaps(p)).toBe(false);
    expect(fileWithinSizeCap(p)).toBe(false);
  });

  it("rejects a non-zip / corrupt file", () => {
    const p = join(dir, "garbage.docx");
    writeFileSync(p, Buffer.from("not a zip at all"));
    expect(zipWithinCaps(p)).toBe(false);
  });

  it("fileWithinSizeCap returns false for a missing file", () => {
    expect(fileWithinSizeCap(join(dir, "nope.pdf"))).toBe(false);
  });

  it("fileWithinSizeCap accepts a small file", () => {
    const p = join(dir, "small.pdf");
    writeFileSync(p, Buffer.from("%PDF-1.4 tiny"));
    expect(fileWithinSizeCap(p)).toBe(true);
  });

  // Wiring guard: detect.ts must short-circuit oversized / bomb files to ""
  // before unpdf / officeparser ever decompress them.
  it("extractPdfText returns '' for a PDF over the on-disk cap", async () => {
    const p = join(dir, "huge.pdf");
    writeFileSync(p, Buffer.alloc(OFFICE_MAX_RAW_BYTES + 1, 0x50));
    expect(await extractPdfText(p)).toBe("");
  });

  it("docxToMarkdown returns '' for a non-zip / bomb .docx", async () => {
    const p = join(dir, "garbage.docx");
    writeFileSync(p, Buffer.from("not a zip"));
    expect(await docxToMarkdown(p)).toBe("");
  });

  it("xlsxToMarkdown returns '' for a non-zip / bomb .xlsx", async () => {
    const p = join(dir, "garbage.xlsx");
    writeFileSync(p, Buffer.from("not a zip"));
    expect(await xlsxToMarkdown(p)).toBe("");
  });
});
