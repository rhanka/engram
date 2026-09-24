// §5.9 (Linux): the kernel-observable half of the SQLite writer fence. A flock the process holds on the DB's own
// inode is visible in the kernel's per-open-file-description view at /proc/self/fdinfo/<fd> (its lock record is a
// /proc/locks record prefixed `lock:\t`). A JS shim that fakes fs-ext CANNOT forge a matching kernel line, so this
// is the liveness proof the earlier reviews demanded. These functions are PURE (string in, decision out) so they
// unit-test without fs-ext or a live /proc; sqlite.ts reads /proc/self/fdinfo/<fd> and /proc/self/status and calls in.
//
// Why fdinfo, not /proc/locks: /proc/locks has (process, inode) granularity, so if ANOTHER fd of the same process
// holds a flock on the inode, a /proc/locks match returns true even when OUR fd never took the lock.
// /proc/self/fdinfo/<fd> attaches the lock record to the exact open-file-description that holds it, closing that
// false positive by construction — and it is O(1).
//
// Why inode, NOT major:minor: fdinfo is already per-fd, so a `FLOCK WRITE` record found in it necessarily concerns
// OUR file; the inode is a cheap sanity check on top. We deliberately do NOT match the device (major:minor): the
// kernel prints the SUPERBLOCK device (`s_dev`), while `fstatSync(fd).dev` is the mount's `st_dev` — on btrfs the
// latter is the subvolume's anonymous dev and differs from `s_dev`, so a device match would spuriously fail (brick)
// on btrfs. The inode number (`i_ino`) is identical in both views, so an inode match is device-agnostic and safe.

/**
 * True iff `content` shows a HELD exclusive advisory flock whose inode equals `expect.ino` (a decimal string, as
 * `fstatSync(fd, {bigint:true}).ino.toString()` produces and as the kernel prints it). `content` is either a whole
 * /proc/self/fdinfo/<fd> (whose lock record is prefixed `lock:\t`) or a whole /proc/locks. A holder record, after
 * its optional `lock:` prefix and its `N:` index, reads TYPE CLASS MODE PID MAJ:MIN:INO START END, e.g.
 * `lock:\t1: FLOCK  ADVISORY  WRITE 1234 fc:01:918 0 EOF`; the inode is the last colon-separated field of MAJ:MIN:INO.
 * Blocked-waiter lines (`-> …`) are skipped. `pid` is OPTIONAL: fdinfo is already scoped to our own fd so no pid
 * match is needed there; pass it only when matching the process-wide /proc/locks, where the pid disambiguates.
 */
export function procLocksHoldsExclusiveFlockV1(content: string, expect: { ino: string; pid?: number }): boolean {
  for (const line of content.split("\n")) {
    let tokens = line.trim().split(/\s+/);
    if (tokens.length === 1 && tokens[0] === "") continue;
    if (tokens[0] === "lock:") tokens = tokens.slice(1); // /proc/self/fdinfo/<fd> prefixes the record with "lock:"
    if (/^\d+:$/.test(tokens[0]!)) tokens = tokens.slice(1); // strip the "N:" record index (both sources)
    if (tokens[0] === "->") continue; // a process blocked waiting on the lock, not a holder
    const [type, , mode, pidToken, fileKey] = tokens;
    if (type !== "FLOCK" || mode !== "WRITE") continue;
    if (expect.pid !== undefined && Number(pidToken) !== expect.pid) continue;
    if (fileKey === undefined) continue;
    const inode = fileKey.slice(fileKey.lastIndexOf(":") + 1); // MAJ:MIN:INO -> INO (device deliberately ignored)
    if (inode === expect.ino) return true;
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
