import { describe, expect, it } from "vitest";

import {
  decodeDevToProcLocksMajMin,
  parsePidFromProcStatusV1,
  procLocksFileKeyV1,
  procLocksHoldsExclusiveFlockV1,
} from "../graphify-memory/proc-locks.js";

/** glibc gnu_dev_makedev — build a dev_t from a (major, minor) pair, mirroring the encode the decoder inverts. */
function mkdev(major: number, minor: number): number {
  const M = BigInt(major);
  const m = BigInt(minor);
  const dev = (m & 0xffn) | ((M & 0xfffn) << 8n) | ((m & ~0xffn) << 12n) | ((M & ~0xfffn) << 32n);
  return Number(dev);
}

describe("st_dev -> /proc/locks maj:min decoder (§5.9 Linux)", () => {
  it("decodes the overlayfs anonymous superblock the docker spike observed (major 0)", () => {
    // fs.statSync(...).dev === 170 on the spike's overlayfs; major is 0, so this case NEVER exercises major-decode.
    expect(decodeDevToProcLocksMajMin(170)).toBe("00:aa");
  });

  it("decodes a real block device (major != 0), the production PVC shape the bind-mount replay must confirm", () => {
    expect(decodeDevToProcLocksMajMin(mkdev(252, 1))).toBe("fc:01");
    expect(decodeDevToProcLocksMajMin(mkdev(259, 0))).toBe("103:00");
    expect(decodeDevToProcLocksMajMin(mkdev(8, 17))).toBe("08:11");
  });

  it("prints a wide minor field in full (kernel %02x is a MINIMUM width, not a truncation)", () => {
    expect(decodeDevToProcLocksMajMin(mkdev(252, 256))).toBe("fc:100");
  });

  it("survives a minor whose encoded bit 31 / bit 32 is set (BigInt, not a signed 32-bit >> which would corrupt it)", () => {
    // minor 0x80000 encodes to dev 0x80000000 (bit 31): a signed JS `>>` would sign-extend and mangle the minor.
    expect(mkdev(0, 0x80000)).toBe(0x80000000);
    expect(decodeDevToProcLocksMajMin(mkdev(0, 0x80000))).toBe("00:80000");
    // minor 0x100000 with a non-zero major sets bit 32 of dev — beyond any 32-bit shift entirely.
    expect(decodeDevToProcLocksMajMin(mkdev(253, 0x100000))).toBe("fd:100000");
  });
});

describe("/proc/locks held-exclusive-flock matcher (§5.9 liveness proof)", () => {
  const key = procLocksFileKeyV1(170, 918); // "00:aa:918"
  const held = `1: POSIX  ADVISORY  READ 10 00:aa:5 0 EOF\n2: FLOCK  ADVISORY  WRITE 4242 00:aa:918 0 EOF\n`;

  it("builds the file key from (dev, ino) the way /proc/locks prints it", () => {
    expect(key).toBe("00:aa:918");
  });

  it("matches our own held exclusive flock line by pid + file key", () => {
    expect(procLocksHoldsExclusiveFlockV1(held, { pid: 4242, majMinIno: key })).toBe(true);
  });

  it("refuses a different pid, a different inode, and a POSIX (non-flock) lock on the same file", () => {
    expect(procLocksHoldsExclusiveFlockV1(held, { pid: 9999, majMinIno: key })).toBe(false);
    expect(procLocksHoldsExclusiveFlockV1(held, { pid: 4242, majMinIno: "00:aa:919" })).toBe(false);
    const posixOnly = `1: POSIX  ADVISORY  WRITE 4242 00:aa:918 0 EOF\n`;
    expect(procLocksHoldsExclusiveFlockV1(posixOnly, { pid: 4242, majMinIno: key })).toBe(false);
  });

  it("skips a blocked-waiter line (`-> `) — a waiter does not hold the lock", () => {
    const waiter = `2: -> FLOCK  ADVISORY  WRITE 4242 00:aa:918 0 EOF\n`;
    expect(procLocksHoldsExclusiveFlockV1(waiter, { pid: 4242, majMinIno: key })).toBe(false);
  });
});

describe("PID from /proc/self/status (namespace-correct, not process.pid)", () => {
  it("reads the Pid line", () => {
    expect(parsePidFromProcStatusV1("Name:\tnode\nUmask:\t0022\nState:\tR (running)\nPid:\t4242\nPPid:\t1\n")).toBe(4242);
  });

  it("returns undefined when no Pid line is present", () => {
    expect(parsePidFromProcStatusV1("Name:\tnode\nPPid:\t1\n")).toBeUndefined();
  });
});
