// §5.9 (Linux): pure classification of a filesystem magic number for the SQLite writer fence. No native imports,
// so it unit-tests without fs-ext or a real statfs; sqlite.ts reads statfsSync(...).type and calls in.
//
// The fence needs a DURABLE, LOCAL, single-writer filesystem. tmpfs and overlayfs are local but EPHEMERAL — a
// database on either is lost when the pod/container restarts (overlayfs = the container's writable layer), which
// contradicts the block-PVC deployment constraint (§8, D-A). They are refused unless a NON-production embedded
// harness opts in explicitly via allow_ephemeral_filesystem_store.

export const SQLITE_REJECTED_FILESYSTEM_TYPES = new Set<number>([
  0x6969, // nfs
  0x517b, // cifs/smb
  0x65735546, // fuse
]);

// Known local Linux filesystems. macOS/Windows types (apfs, hfs+, ntfs, refs) are intentionally absent: the fenced
// store is Linux-only (it fails closed at open elsewhere), so they are unreachable here.
export const SQLITE_LOCAL_FILESYSTEM_TYPES = new Set<number>([
  0x01021994, // tmpfs (ephemeral — see below)
  0x58465342, // xfs
  0x794c7630, // overlayfs (ephemeral — see below)
  0x9123683e, // btrfs
  0xef53, // ext2/3/4
]);

// Local but EPHEMERAL: a database here does not survive a restart, so it is refused unless the host opts in. One
// set, read once on the fence path, so membership is unit-testable; the real overlayfs behaviour is proven at the
// container gate (G2), not locally.
export const SQLITE_EPHEMERAL_FILESYSTEM_TYPES = new Set<number>([
  0x01021994, // tmpfs
  0x794c7630, // overlayfs
]);

export type FenceFilesystemVerdictV1 = { admit: true } | { admit: false; reason: string };

/**
 * Classify a filesystem magic number for the fence. `allowEphemeral` must already be the strict boolean the caller
 * derived (`option === true`), so a forgeable string never widens the exemption. Refusal reasons name the type in
 * hex; the caller surfaces them as CAPABILITY_UNAVAILABLE.
 */
export function classifyFenceFilesystemV1(fsType: number, allowEphemeral: boolean): FenceFilesystemVerdictV1 {
  const hex = `0x${fsType.toString(16)}`;
  if (SQLITE_REJECTED_FILESYSTEM_TYPES.has(fsType)) {
    return { admit: false, reason: `the canonical database is on a network/removable/FUSE filesystem (${hex}) that cannot hold a single-writer fence` };
  }
  if (!SQLITE_LOCAL_FILESYSTEM_TYPES.has(fsType)) {
    return { admit: false, reason: `the canonical database is on an unknown filesystem (${hex}) that is not a supported local filesystem` };
  }
  if (SQLITE_EPHEMERAL_FILESYSTEM_TYPES.has(fsType) && !allowEphemeral) {
    return { admit: false, reason: `the canonical database is on an ephemeral filesystem (${hex}) that does not survive a restart; set allow_ephemeral_filesystem_store only for a non-production embedded harness` };
  }
  return { admit: true };
}
