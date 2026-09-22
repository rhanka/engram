// §5.9 (Linux): the kernel-observable half of the SQLite writer fence. A flock the process holds on the DB's own
// inode appears in /proc/locks; a JS shim that fakes fs-ext CANNOT forge a matching kernel line, so this is the
// liveness proof the earlier reviews demanded. These functions are PURE (string in, decision out) so they are
// unit-testable without fs-ext or a live /proc — sqlite.ts reads /proc/locks and /proc/self/status and calls in.

/**
 * Decode a Linux dev_t — as Node exposes it in `fs.Stats.dev` — into the `major:minor` hex pair /proc/locks
 * prints. It replicates glibc `gnu_dev_major`/`gnu_dev_minor` and the kernel's `%02x:%02x` field formatting
 * (lowercase hex, zero-padded to a minimum of two digits; a wider field is printed in full, e.g. minor 256 =>
 * "100"). dev_t can set bits above 2^31, so the arithmetic runs in BigInt: JS `>>` is a SIGNED 32-bit shift and
 * corrupts a minor whose bit 31 is set (minor >= 2^19 lands there after the <<12 encoding) — `>>>` alone would
 * still truncate the >32-bit major bits, so BigInt masks are the only correct form.
 */
export function decodeDevToProcLocksMajMin(dev: number): string {
  const d = BigInt(dev);
  // glibc masks: major from bits 8..19 and 44..63; minor from bits 0..7 and 20..43.
  const major = ((d & 0x00000000000fff00n) >> 8n) | ((d & 0xfffff00000000000n) >> 32n);
  const minor = (d & 0x00000000000000ffn) | ((d & 0x00000ffffff00000n) >> 12n);
  const hex2 = (value: bigint) => value.toString(16).padStart(2, "0");
  return `${hex2(major)}:${hex2(minor)}`;
}

/** The kernel identity of a fd's file as it appears in a /proc/locks holder line: `${major:minor}:${inode}`. */
export function procLocksFileKeyV1(dev: number, ino: number): string {
  return `${decodeDevToProcLocksMajMin(dev)}:${ino}`;
}

/**
 * True iff `content` (the whole of /proc/locks) contains a HELD exclusive advisory flock, owned by `pid`, on the
 * file `${majMinIno}` (from procLocksFileKeyV1). Blocked-waiter lines (`-> ...`) are not held locks and are
 * skipped. A holder line, after its leading `N:` index, reads: TYPE CLASS MODE PID MAJ:MIN:INO START END, e.g.
 * `1: FLOCK  ADVISORY  WRITE 1234 fc:01:918`.
 */
export function procLocksHoldsExclusiveFlockV1(content: string, expect: { pid: number; majMinIno: string }): boolean {
  for (const line of content.split("\n")) {
    let tokens = line.trim().split(/\s+/);
    if (tokens.length === 1 && tokens[0] === "") continue;
    if (/^\d+:$/.test(tokens[0]!)) tokens = tokens.slice(1);
    if (tokens[0] === "->") continue; // a process blocked waiting on the lock, not a holder
    const [type, , mode, pidToken, fileKey] = tokens;
    if (type !== "FLOCK" || mode !== "WRITE") continue;
    if (Number(pidToken) === expect.pid && fileKey === expect.majMinIno) return true;
  }
  return false;
}

/**
 * The process's PID as the kernel names it in the reader's PID namespace — the "Pid:" line of /proc/self/status.
 * Inside a container `process.pid` is the namespaced view and does NOT match /proc/locks (which the spike showed),
 * so the fence reads this instead. Pure over the file's content; sqlite.ts supplies readFileSync("/proc/self/status").
 */
export function parsePidFromProcStatusV1(content: string): number | undefined {
  const match = /^Pid:\s*(\d+)\s*$/m.exec(content);
  return match === null ? undefined : Number(match[1]);
}
