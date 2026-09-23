import { describe, expect, it } from "vitest";

import { classifyFenceFilesystemV1 } from "../graphify-memory/filesystem-fence.js";

const EXT4 = 0xef53;
const XFS = 0x58465342;
const BTRFS = 0x9123683e;
const TMPFS = 0x01021994;
const OVERLAYFS = 0x794c7630;
const NFS = 0x6969;
const CIFS = 0x517b;
const FUSE = 0x65735546;
const UNKNOWN = 0x12345678;

const admit = (fsType: number, allowEphemeral: boolean) => classifyFenceFilesystemV1(fsType, allowEphemeral).admit;
const reasonOf = (fsType: number, allowEphemeral: boolean) => {
  const v = classifyFenceFilesystemV1(fsType, allowEphemeral);
  return v.admit ? "" : v.reason;
};

describe("§5.9 fence filesystem classification", () => {
  it("admits durable local filesystems regardless of the ephemeral flag", () => {
    for (const fs of [EXT4, XFS, BTRFS]) {
      expect(admit(fs, false)).toBe(true);
      expect(admit(fs, true)).toBe(true);
    }
  });

  it("refuses tmpfs AND overlayfs (one ephemeral set) unless the host opts in — both take the same code path", () => {
    for (const fs of [TMPFS, OVERLAYFS]) {
      expect(admit(fs, false)).toBe(false);
      expect(reasonOf(fs, false)).toContain("ephemeral");
      expect(reasonOf(fs, false)).toContain(`0x${fs.toString(16)}`); // names the type in hex
      expect(admit(fs, true)).toBe(true); // opted in
    }
  });

  it("is non-vacuous: the ephemeral guard alone flips the verdict for tmpfs (remove it ⇒ this would stay admitted)", () => {
    expect(admit(TMPFS, false)).toBe(false);
    expect(admit(TMPFS, true)).toBe(true);
  });

  it("refuses network/removable/FUSE filesystems, and the ephemeral flag does NOT override that (distinct branch)", () => {
    for (const fs of [NFS, CIFS, FUSE]) {
      expect(admit(fs, false)).toBe(false);
      expect(admit(fs, true)).toBe(false); // the opt-in only relaxes ephemeral, never network
      expect(reasonOf(fs, true)).toContain("network/removable/FUSE");
    }
  });

  it("refuses an unknown filesystem, with or without the flag", () => {
    expect(admit(UNKNOWN, false)).toBe(false);
    expect(admit(UNKNOWN, true)).toBe(false);
    expect(reasonOf(UNKNOWN, false)).toContain("unknown");
  });
});
