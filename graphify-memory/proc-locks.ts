// §5.9 (Linux): the kernel-observable half of the SQLite writer fence. A flock the process holds on the DB's own
// inode is visible in the kernel's per-open-file-description view at /proc/self/fdinfo/<fd> (and, coarser, in
// /proc/locks). A JS shim that fakes fs-ext CANNOT forge a matching kernel line, so this is the liveness proof the
// earlier reviews demanded. These functions are PURE (string in, decision out) so they unit-test without fs-ext or
// a live /proc; sqlite.ts reads /proc/self/fdinfo/<fd> and /proc/self/status and calls in.
//
// Why fdinfo, not /proc/locks: /proc/locks has (process, inode) granularity, so if ANOTHER fd of the same process
// holds a flock on the inode (an unclosed probe, a prior instance), a /proc/locks match returns true even when OUR
// fd never took the lock. /proc/self/fdinfo/<fd> attaches the "lock:" line to the exact open-file-description that
// holds it, closing that false positive by construction — and it is O(1). Its record equals a /proc/locks record
// prefixed with "lock:\t", so the matcher below accepts both.

/**
 * Decode a Linux dev_t into the `major:minor` hex pair /proc/locks / fdinfo print. It replicates glibc
 * `gnu_dev_major`/`gnu_dev_minor` and the kernel's `%02x:%02x` field (lowercase hex, min width 2; a wider field
 * prints in full, e.g. minor 256 => "100"). Accepts a bigint so the caller can pass `fstatSync(fd, {bigint:true})`
 * output directly: a dev/ino routed through a JS `number` loses precision above 2^53 (large XFS/btrfs inodes),
 * which would silently break the /proc key match. The arithmetic is BigInt regardless — JS `>>` is a SIGNED 32-bit
 * shift that corrupts a minor whose encoded bit 31/32 is set (minor >= 2^19), and `>>>` alone truncates the major
 * bits above 2^32.
 */
export function decodeDevToProcLocksMajMin(dev: number | bigint): string {
  const d = typeof dev === "bigint" ? dev : BigInt(dev);
  // glibc masks: major from bits 8..19 and 44..63; minor from bits 0..7 and 20..43.
  const major = ((d & 0x00000000000fff00n) >> 8n) | ((d & 0xfffff00000000000n) >> 32n);
  const minor = (d & 0x00000000000000ffn) | ((d & 0x00000ffffff00000n) >> 12n);
  const hex2 = (value: bigint) => value.toString(16).padStart(2, "0");
  return `${hex2(major)}:${hex2(minor)}`;
}

/** The kernel identity of a fd's file as a /proc holder line prints it: `${major:minor}:${inode}` (inode decimal). */
export function procLocksFileKeyV1(dev: number | bigint, ino: number | bigint): string {
  const inode = typeof ino === "bigint" ? ino : BigInt(ino);
  return `${decodeDevToProcLocksMajMin(dev)}:${inode.toString()}`;
}

/**
 * True iff `content` shows a HELD exclusive advisory flock on the file `${majMinIno}` (from procLocksFileKeyV1).
 * `content` is either a whole /proc/self/fdinfo/<fd> (whose lock record is prefixed `lock:\t`) or a whole
 * /proc/locks. A holder record, after its optional `lock:` prefix and its `N:` index, reads TYPE CLASS MODE PID
 * MAJ:MIN:INO START END, e.g. `lock:\t1: FLOCK  ADVISORY  WRITE 1234 fc:01:918 0 EOF`. Blocked-waiter lines
 * (`-> …`) are skipped. `pid` is OPTIONAL: fdinfo is already scoped to our own fd so no pid match is needed there;
 * pass it only when matching the process-wide /proc/locks, where the pid disambiguates the owner.
 */
export function procLocksHoldsExclusiveFlockV1(content: string, expect: { majMinIno: string; pid?: number }): boolean {
  for (const line of content.split("\n")) {
    let tokens = line.trim().split(/\s+/);
    if (tokens.length === 1 && tokens[0] === "") continue;
    if (tokens[0] === "lock:") tokens = tokens.slice(1); // /proc/self/fdinfo/<fd> prefixes the record with "lock:"
    if (/^\d+:$/.test(tokens[0]!)) tokens = tokens.slice(1); // strip the "N:" record index (both sources)
    if (tokens[0] === "->") continue; // a process blocked waiting on the lock, not a holder
    const [type, , mode, pidToken, fileKey] = tokens;
    if (type !== "FLOCK" || mode !== "WRITE") continue;
    if (expect.pid !== undefined && Number(pidToken) !== expect.pid) continue;
    if (fileKey === expect.majMinIno) return true;
  }
  return false;
}

/**
 * The process PID as the kernel names it, from the "Pid:" line of /proc/self/status. Reading it from /proc/self —
 * rather than trusting `process.pid` — keeps the PID in the SAME procfs namespace as the /proc/self/fdinfo and
 * /proc/locks tables the fence matches against, so a namespace mismatch is impossible by construction. Pure over
 * the file content; sqlite.ts supplies readFileSync("/proc/self/status").
 */
export function parsePidFromProcStatusV1(content: string): number | undefined {
  const match = /^Pid:\s*(\d+)\s*$/m.exec(content);
  return match === null ? undefined : Number(match[1]);
}
