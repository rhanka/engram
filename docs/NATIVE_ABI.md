# Native ABI — image builders' note

Definition (D-7(i), validated): every runtime image (CI runner or container)
that executes the fenced SQLite store carries `better-sqlite3` and `fs-ext`
binaries built for that image's Node ABI (`process.versions.modules`),
platform, architecture and libc, and proves it at image build time with a
load-and-lock smoke — instead of discovering a mismatch at the first fenced
open.

## Rules for image builders

- Build the addons with the runtime's exact Node major and libc. Never copy
  `node_modules` across Node majors, or between glibc and musl.
- `fs-ext` always compiles from source at install time (a NAN-based native
  addon compiled at install, bound to the Node ABI); the toolchain therefore
  stays in a builder stage of the same Node base image family, and the
  runtime image ships no Python (D-7(iii)).
- Run the smoke as an image build step, on the target volume when the
  database will live there:

  ```sh
  node scripts/check-native-abi.mjs [dir]
  ```

  The script (Node only) prints the runtime identity, loads both addons
  exactly as `engram-memory` resolves them, prints the bundled
  `sqlite_version()`, and — on Linux — takes a real `flock` and requires its
  record in `/proc/self/fdinfo`. Outside Linux it exits with
  `PLATFORM_UNSUPPORTED` before the lock step: the fenced store is
  Linux-only. Exit causes: `ABI_MISMATCH`, `MODULE_MISSING`, `LOCK_UNPROVEN`,
  `PLATFORM_UNSUPPORTED`.

- Bundled SQLite at the time of writing: `3.53.2` (via
  `better-sqlite3@12.11.1`, reported by the smoke; input to D-9/X3 — the
  smoke never refuses on the version).
