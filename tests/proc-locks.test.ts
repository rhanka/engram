import { describe, expect, it } from "vitest";

import {
  parsePidFromProcStatusV1,
  procLocksHoldsExclusiveFlockV1,
} from "../engram-memory/proc-locks.js";

describe("held-exclusive-flock matcher (§5.9 liveness proof) — /proc/locks and /proc/self/fdinfo/<fd>, inode-only", () => {
  const procLocks = `1: POSIX  ADVISORY  READ 10 00:aa:5 0 EOF\n2: FLOCK  ADVISORY  WRITE 4242 00:aa:918 0 EOF\n`;
  // /proc/self/fdinfo/<fd> attaches the lock to the open-file-description as a "lock:"-prefixed record.
  const fdinfo = `pos:\t0\nflags:\t02\nmnt_id:\t29\nlock:\t1: FLOCK  ADVISORY  WRITE 4242 fc:01:918 0 EOF\n`;

  it("matches our held exclusive flock in /proc/locks by inode (+ optional pid)", () => {
    expect(procLocksHoldsExclusiveFlockV1(procLocks, { pid: 4242, ino: "918" })).toBe(true);
    expect(procLocksHoldsExclusiveFlockV1(procLocks, { ino: "918" })).toBe(true);
  });

  it("matches a fdinfo `lock:`-prefixed record by inode WITHOUT needing a pid (fdinfo is already our own fd)", () => {
    expect(procLocksHoldsExclusiveFlockV1(fdinfo, { ino: "918" })).toBe(true);
    expect(procLocksHoldsExclusiveFlockV1(fdinfo, { ino: "918", pid: 4242 })).toBe(true);
    expect(procLocksHoldsExclusiveFlockV1(fdinfo, { ino: "919" })).toBe(false);
  });

  it("is device-agnostic: the SAME inode under a DIFFERENT major:minor still matches (btrfs s_dev ≠ st_dev — no brick)", () => {
    // On btrfs the kernel prints the superblock device, which differs from fstat's subvolume st_dev; only the
    // inode is stable across the two views, so matching the inode alone must succeed regardless of the device.
    const btrfs = `lock:\t1: FLOCK  ADVISORY  WRITE 4242 00:35:918 0 EOF\n`;
    expect(procLocksHoldsExclusiveFlockV1(btrfs, { ino: "918" })).toBe(true);
  });

  it("refuses a different pid, a different inode, and a POSIX (non-flock) lock on the same inode", () => {
    expect(procLocksHoldsExclusiveFlockV1(procLocks, { pid: 9999, ino: "918" })).toBe(false);
    expect(procLocksHoldsExclusiveFlockV1(procLocks, { pid: 4242, ino: "919" })).toBe(false);
    const posixOnly = `1: POSIX  ADVISORY  WRITE 4242 00:aa:918 0 EOF\n`;
    expect(procLocksHoldsExclusiveFlockV1(posixOnly, { pid: 4242, ino: "918" })).toBe(false);
  });

  it("skips a blocked-waiter line (`-> `) — a waiter does not hold the lock", () => {
    const waiter = `2: -> FLOCK  ADVISORY  WRITE 4242 00:aa:918 0 EOF\n`;
    expect(procLocksHoldsExclusiveFlockV1(waiter, { pid: 4242, ino: "918" })).toBe(false);
  });

  it("matches a large (>2^53) inode as an exact decimal string, never through a lossy number", () => {
    const bigIno = "9007199254740993"; // 2^53 + 1: exact as a string, corrupted as a JS number
    const line = `lock:\t1: FLOCK  ADVISORY  WRITE 4242 fc:01:${bigIno} 0 EOF\n`;
    expect(procLocksHoldsExclusiveFlockV1(line, { ino: bigIno })).toBe(true);
    expect(procLocksHoldsExclusiveFlockV1(line, { ino: "9007199254740992" })).toBe(false);
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
