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

  it("accepts a bigint dev/ino so a large inode routed via fstatSync(fd,{bigint:true}) never loses precision", () => {
    expect(decodeDevToProcLocksMajMin(64513n)).toBe("fc:01");
    // 2^53 + 1 is not representable as a JS number (rounds to 2^53); a bigint ino must print exactly.
    const bigIno = 9007199254740993n;
    expect(Number(bigIno)).toBe(9007199254740992); // demonstrates the number-path corruption this avoids
    expect(procLocksFileKeyV1(64513n, bigIno)).toBe("fc:01:9007199254740993");
  });
});

describe("held-exclusive-flock matcher (§5.9 liveness proof) — /proc/locks and /proc/self/fdinfo/<fd>", () => {
  const key = procLocksFileKeyV1(170, 918); // "00:aa:918"
  const procLocks = `1: POSIX  ADVISORY  READ 10 00:aa:5 0 EOF\n2: FLOCK  ADVISORY  WRITE 4242 00:aa:918 0 EOF\n`;
  // /proc/self/fdinfo/<fd> attaches the lock to the open-file-description as a "lock:"-prefixed record.
  const fdinfo = `pos:\t0\nflags:\t02\nmnt_id:\t29\nlock:\t1: FLOCK  ADVISORY  WRITE 4242 fc:01:918 0 EOF\n`;

  it("builds the file key from (dev, ino) the way /proc prints it", () => {
    expect(key).toBe("00:aa:918");
  });

  it("matches our held exclusive flock in /proc/locks by pid + file key", () => {
    expect(procLocksHoldsExclusiveFlockV1(procLocks, { pid: 4242, majMinIno: key })).toBe(true);
  });

  it("matches a fdinfo `lock:`-prefixed record by file key WITHOUT needing a pid (fdinfo is already our own fd)", () => {
    const fdKey = procLocksFileKeyV1(64513, 918); // "fc:01:918"
    expect(procLocksHoldsExclusiveFlockV1(fdinfo, { majMinIno: fdKey })).toBe(true);
    expect(procLocksHoldsExclusiveFlockV1(fdinfo, { majMinIno: fdKey, pid: 4242 })).toBe(true);
    expect(procLocksHoldsExclusiveFlockV1(fdinfo, { majMinIno: "fc:01:919" })).toBe(false);
  });

  it("refuses a different pid, a different inode, and a POSIX (non-flock) lock on the same file", () => {
    expect(procLocksHoldsExclusiveFlockV1(procLocks, { pid: 9999, majMinIno: key })).toBe(false);
    expect(procLocksHoldsExclusiveFlockV1(procLocks, { pid: 4242, majMinIno: "00:aa:919" })).toBe(false);
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
