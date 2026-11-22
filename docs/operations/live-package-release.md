# Releasing `@sentropic/engram-live`

Operational procedure for packaging, verifying, publishing, and promoting the neutral live collector package `@sentropic/engram-live` (`engram-live/`).

Authority:
- `plan/09-BRANCH_LIVE_GIT_INDEXING.md` (Commissioning Rules, checkpoints **R-E-pre** and **R-E**, row 13 **E-REL**).
- `spec/SPEC_LIVE_GIT_INDEXING.md` (§3 neutral boundary, §11 no-Python deliverable and prerelease rule).

This procedure is separate from the root `@sentropic/engram` release job in `.github/workflows/typescript-ci.yml` (which publishes `@sentropic/engram` on `v*` tags only). `@sentropic/engram-live` is NEVER published on a push, tag, schedule, or GitHub release trigger.

> **Dry-run boundary (E-REL):** Lot E-REL builds, verifies, and records the offline dry-run integrity only. Actual publication to npm and workflow dispatch are conductor operations.

---

## 1. Release Invariants

Every release (automated or manual) MUST obey all of the following invariants:

1. **Manual trigger only:** `.github/workflows/live-package-release.yml` runs on `workflow_dispatch` only (no `push`, `pull_request`, `tags`, `schedule`, `release`, or `workflow_call` trigger).
2. **Prerelease dist-tag rule:** A prerelease version (any SemVer 2.0.0 version containing `-`, such as `0.2.0-pre.1`) MUST NEVER be published under the `latest` dist-tag. Use `next` (or another explicit non-`latest` tag such as `prerelease`).
3. **Mandatory verification gate:** No publish path may skip `node scripts/build-live.mjs`, `node scripts/check-live-package.mjs`, or the neutrality and packed-tarball suites (`tests/live-neutrality.test.ts`, `tests/live-package.test.ts`).
4. **Pack-time version stamping only:** The release version is an explicit input applied at pack time to `engram-live/package.json` and to nothing else. No source file, compiled artifact, grammar asset, or `engram-live/package-lock.json` changes between a prerelease and its final promotion re-pack.
5. **Zero Python, zero dependencies, zero lifecycle scripts:** `@sentropic/engram-live` declares no `dependencies`, `optionalDependencies`, `peerDependencies`, `bin`, or npm lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`, `prepack`, `postpack`, `prepublishOnly`, `publish`, `postpublish`). Every step uses Node/npm/git/tar only.
6. **Scoped registry credentials:** Registry credentials (`secrets.NPM_TOKEN` or OIDC `id-token: write`) are NEVER exposed to checkout, dependency install, build, `check-live-package.mjs`, tests, or packing. In GitHub Actions, `secrets.NPM_TOKEN` is read ONLY in the single `Publish verified tarball to npm` step of the `publish` job, which is skipped whenever `dry_run` is `true`.
7. **Consumer pinning rule (LIVE §11):** Downstream consumers (`cluster-mesh`, `h2a`) pin prereleases by exact version and lockfile `integrity` (never `file:` paths or neighboring-checkout imports).

---

## 2. Preconditions

Before running a dry run or cutting a checkpoint:

1. **Disk class B floor:** Confirm at least **10 GiB** free on the worktree filesystem (`df -h .`). Remove all temporary pack, extract, and npm-cache directories at the end.
2. **Checkpoint readiness:**
   - **R-E-pre:** Rows 0b and 1–13 of `plan/09-BRANCH_LIVE_GIT_INDEXING.md` are merged on `main` with green gates.
   - **R-E:** The `m8` and `m12` cases of `L3a-L1` and the `L3b-S` gate have passed on SQLite against the exact pinned `R-E-pre` version and integrity.
3. **Clean working tree on a merged `main` commit:** Never publish from an unmerged branch or a dirty worktree.
4. **First-time npm package bootstrap (Trusted Publishing):** Just as for `@sentropic/engram` (`docs/RELEASING-0.19.0.md`), npm Trusted Publishing (OIDC) can only be attached on npmjs.com to an existing package.
   - For the **very first** publication of `@sentropic/engram-live` (checkpoint **R-E-pre**), either publish manually from a clean conductor checkout with 2FA (Section 4) OR supply a short-lived granular `NPM_TOKEN` secret scoped to `@sentropic` package creation/publish for that single dispatch.
   - Immediately after **R-E-pre** exists on npmjs.com, configure a Trusted Publisher on `@sentropic/engram-live` pointing to repository `rhanka/engram` and workflow `live-package-release.yml`, and delete any temporary `NPM_TOKEN`. Subsequent dispatches (including checkpoint **R-E**) authenticate via OIDC (`id-token: write`) with no static token.

---

## 3. Method A — GitHub Actions Manual Dispatch

Workflow file: `.github/workflows/live-package-release.yml`.

### Workflow inputs

| Input | Type | Required | Default | Rules |
|---|---|---|---|---|
| `version` | `string` | Yes | — | Strict SemVer 2.0.0 without build metadata (e.g. `0.2.0-pre.1` for R-E-pre, `0.2.0` for R-E). Stamped into `engram-live/package.json` only at pack time. |
| `dist_tag` | `string` | Yes | `next` | Explicit npm dist-tag (`^[a-z][a-z0-9._-]*$`, not a version string). `latest` is rejected for any prerelease version in both jobs. |
| `dry_run` | `boolean` | Yes | `true` | When `true`, only `build-and-verify` runs (builds, verifies, packs, uploads tarball + `release-evidence.json` artifact); the `publish` job is skipped. |
| `source_commit` | `string` | No | `""` | Optional 40-hex lowercase commit SHA. Leave empty to pack the dispatched `main` HEAD; set to the exact `R-E-pre` commit SHA when cutting checkpoint **R-E**. |

### What the workflow enforces

1. **`build-and-verify` (`permissions: { contents: read }`, zero secrets):**
   - Validates `version`, `dist_tag`, `dry_run`, prerelease-vs-`latest` prohibition, optional `source_commit` checkout, and (when `dry_run=false`) verifies the target commit is an ancestor of `origin/<default_branch>`.
   - Installs root build/test devDependencies with `npm ci --legacy-peer-deps --ignore-scripts` and runs `node scripts/check-no-python.mjs`.
   - Stamps `inputs.version` into `engram-live/package.json` and verifies no other field or tracked file changed.
   - Runs `node scripts/build-live.mjs`, `node scripts/check-live-package.mjs`, and `npx --no-install vitest run tests/live-neutrality.test.ts tests/live-package.test.ts`.
   - Runs both `npm pack --dry-run --json` and `npm pack --json` into `$RUNNER_TEMP/release-artifact`, asserts exact equality of `id`, `name`, `version`, `filename`, `size`, `unpackedSize`, `shasum`, `integrity`, and `entryCount`, computes SHA-256 of the `.tgz`, every extracted file, `package.json` without `version`, `nonManifestFilesTreeSha256` (sorted `${sha256}  ${path}\n` across all non-manifest packed files), and `fixtureSha256` (`tests/fixtures/live-code-context.json`), restores `engram-live/package.json`, and uploads the verified `.tgz` + `release-evidence.json` artifact (90-day retention).
2. **`publish` (`needs: [build-and-verify]`, `if: ${{ inputs.dry_run == false }}`, `permissions: { id-token: write }`):**
   - Downloads the exact artifact produced by `build-and-verify` (never rebuilds or repacks).
   - Re-validates `version`, `dist_tag`, prerelease-vs-`latest`, `evidence.dryRun === false`, tarball SHA-256, SRI SHA-512 `integrity`, and the embedded `package/package.json` metadata (no dependencies, no `bin`, no lifecycle scripts, `publishConfig.access === "public"`).
   - Upgrades `npm` to `11.6.2` for Trusted Publishing (`typescript-ci.yml` parity).
   - **Single credential-reading step (`Publish verified tarball to npm`):** binds `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`, writes a `0600` ephemeral `NPM_CONFIG_USERCONFIG` referencing `${NODE_AUTH_TOKEN}` only if non-empty (removed on `EXIT`), and runs `npm publish "$TARBALL_PATH" --tag="$RELEASE_DIST_TAG" --access=public`.
   - **Post-publish check (zero credentials):** polls `npm view` to verify the registry `dist.integrity` matches the packed tarball, `dist-tags[dist_tag]` equals `version`, and for prereleases `dist-tags.latest !== version`.

### Conductor dispatch examples (do not run in E-REL)

```bash
# 1. Dry run on main (safe default; does not publish)
gh workflow run live-package-release.yml --ref main \
  -f version=0.2.0-pre.1 \
  -f dist_tag=next \
  -f dry_run=true

# 2. Checkpoint R-E-pre (conductor only, after rows 0b and 1–13 are green on main)
gh workflow run live-package-release.yml --ref main \
  -f version=0.2.0-pre.1 \
  -f dist_tag=next \
  -f dry_run=false

# 3. Checkpoint R-E (conductor only, re-pack of the exact R-E-pre commit SHA after L3a-L1 m8/m12 and L3b-S pass)
gh workflow run live-package-release.yml --ref main \
  -f version=0.2.0 \
  -f dist_tag=latest \
  -f dry_run=false \
  -f source_commit=<40-hex-R-E-pre-commit-SHA>
```

---

## 4. Method B — Equivalent Manual Conductor Steps (Offline Dry Run & Publish)

Run from a clean checkout of the target commit on `main`. Every command is pure Node/npm/git/tar (zero Python).

### 4.1 Preflight and offline build / check / dry-run pack

```bash
# 1. Disk class B preflight (>= 10 GiB free) and clean tree check
df -h .
git status --short
git rev-parse HEAD

# 2. Zero-Python check, build, and mandatory package guard
node scripts/check-no-python.mjs
node scripts/build-live.mjs
node scripts/check-live-package.mjs

# 3. Neutrality and packed-tarball acceptance suites
# (pass --configLoader runner if node_modules is a read-only symlink)
npx --no-install vitest run --configLoader runner \
  tests/live-neutrality.test.ts tests/live-package.test.ts

# 4. Offline dry-run pack (writes no tarball)
TMP_CACHE="$(mktemp -d)"
trap 'rm -rf "$TMP_CACHE"' EXIT
(
  cd engram-live
  npm_config_cache="$TMP_CACHE/cache" npm_config_update_notifier=false \
    npm pack --dry-run --json
)
```

### 4.2 GUARD check: verify `npm pack --dry-run --json` integrity matches the recorded integrity

```bash
node - <<'EOF'
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const note = readFileSync("docs/operations/live-package-release.md", "utf8");
const match = note.match(/<!-- E-REL-INTEGRITY-RECORD:START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- E-REL-INTEGRITY-RECORD:END -->/);
if (!match) throw new Error("Missing E-REL integrity JSON block in docs/operations/live-package-release.md");
const recorded = JSON.parse(match[1]);

const tmp = mkdtempSync(join(tmpdir(), "erel-guard-"));
try {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: resolve("engram-live"),
    env: { ...process.env, npm_config_cache: join(tmp, "cache"), npm_config_update_notifier: "false" },
    encoding: "utf8",
  });
  const actual = JSON.parse(out)[0];
  if (actual.version !== recorded.version) {
    throw new Error(`Version mismatch: actual=${actual.version} vs recorded=${recorded.version}`);
  }
  if (actual.integrity !== recorded.integrity) {
    throw new Error(`Integrity mismatch: actual=${actual.integrity} vs recorded=${recorded.integrity}`);
  }
  if (actual.shasum !== recorded.shasum || actual.entryCount !== recorded.entryCount) {
    throw new Error(`Metadata mismatch: actual=${JSON.stringify(actual)} vs recorded=${JSON.stringify(recorded)}`);
  }
  console.log(`E-REL GUARD PASS: ${actual.id} integrity=${actual.integrity} entries=${actual.entryCount}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
EOF
```

### 4.3 Manual conductor publish (ONLY when cutting R-E-pre or R-E; NEVER during E-REL)

```bash
# Set explicit version and dist-tag (NEVER use latest for a prerelease!)
export RELEASE_VERSION="0.2.0-pre.1"   # or "0.2.0" for checkpoint R-E
export RELEASE_DIST_TAG="next"         # or "latest" for final non-prerelease ONLY

# Fail fast if prerelease + latest
node -e '
  const v = process.env.RELEASE_VERSION, t = process.env.RELEASE_DIST_TAG;
  if (v.includes("-") && t === "latest") { console.error("Refusing latest dist-tag for prerelease:", v); process.exit(1); }
'

# Pack into an isolated temporary directory (stamp version into engram-live/package.json only if re-packing)
TMP_RELEASE="$(mktemp -d)"
trap 'git checkout -- engram-live/package.json; rm -rf "$TMP_RELEASE"' EXIT

node -e '
  const fs = require("node:fs");
  const p = "engram-live/package.json";
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  pkg.version = process.env.RELEASE_VERSION;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
'
node scripts/build-live.mjs
node scripts/check-live-package.mjs
(
  cd engram-live
  npm_config_cache="$TMP_RELEASE/cache" npm_config_update_notifier=false \
    npm pack --json --pack-destination "$TMP_RELEASE" > "$TMP_RELEASE/pack.json"
)
TARBALL="$TMP_RELEASE/$(node -p "JSON.parse(require('fs').readFileSync('$TMP_RELEASE/pack.json','utf8'))[0].filename")"

# Dry run before publishing
npm publish "$TARBALL" --tag="$RELEASE_DIST_TAG" --access=public --dry-run

# Conductor-only actual publish (interactive 2FA or scoped token; never run in E-REL):
# npm publish "$TARBALL" --tag="$RELEASE_DIST_TAG" --access=public
#
# Verify registry integrity and dist-tags immediately after publish:
# npm view "@sentropic/engram-live@${RELEASE_VERSION}" dist.integrity
# npm dist-tag ls @sentropic/engram-live
```

---

## 5. Prerelease-to-Final Promotion by Re-Pack (Checkpoint R-E-pre → R-E)

Per `plan/09-BRANCH_LIVE_GIT_INDEXING.md` (Commissioning Rules, “Promotion by re-pack”):

- An npm tarball's SRI `integrity` covers `package/package.json`, `version` included; a prerelease tarball cannot be promoted to a final version under the same tarball digest.
- A prerelease version cannot stay as the final release because `cluster-mesh`'s peer catalogue pins semver ranges that prerelease versions do not satisfy.
- **Checkpoint R-E** is therefore a **re-pack of the exact commit of R-E-pre**, with the final version (`0.2.0`) applied to `engram-live/package.json` as the sole changed input.

### Promotion sequence

1. **Cut R-E-pre:** Publish `@sentropic/engram-live@0.2.0-pre.1` under `--tag=next` (never `latest`) from the E-REL merge commit. Retain the packed `.tgz` and `release-evidence.json` (archived by the workflow artifact or local conductor archive) and record version, `integrity`, tarball SHA-256, contract digests, and commit SHA.
2. **Run Step 2 storage proofs:** `L3a-L1` (`m8` and `m12` cases) and `L3b-S` run on SQLite pinned to the exact `R-E-pre` version and lockfile `integrity`. If a storage proof requires a neutral-package contract change, land the fix, cut `0.2.0-pre.2` under `next`, and re-pin — no final version is burned.
3. **Re-pack the exact R-E-pre commit for R-E:** Run `.github/workflows/live-package-release.yml` (or Section 4.3) with `source_commit=<R-E-pre commit SHA>`, `version=0.2.0`, `dist_tag=latest`, starting with `dry_run=true` to obtain the candidate final tarball.
4. **Prove file-by-file identity before publishing R-E:** Run the comparison script below against the archived `R-E-pre` tarball and the candidate `R-E` tarball. Require:
   - identical sorted packed file lists (all 122 entries),
   - byte-identical SHA-256 for **every** packed file except `package.json` (121/121 files),
   - exact equality of `package.json` once its `version` field is removed, with `pre.version` being a prerelease and `final.version` being the final non-prerelease version.
5. **Publish R-E and record evidence:** Dispatch with `dry_run=false` (or publish the verified tarball manually). Record both versions, both `integrity` values, both tarball SHA-256 digests, and the full comparison output in the checkpoint R-E record.
6. **Downstream re-verification (`L7b-R`):** The first `sentropic` lot starting after R-E (`L7b-R`) re-pins `cluster-mesh` from `R-E-pre` to the final `R-E` version and lockfile `integrity`, and re-runs the `m8` and `m12` cases of `L3a-L1` and the named cases of the `L3b-S` gate with zero skips before checkpoint `R-S` is cut.

### Checkpoint R-E tarball comparison script (pure Node, zero Python)

```bash
node - "$PRE_TARBALL" "$FINAL_TARBALL" <<'EOF'
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const [prePathArg, finalPathArg] = process.argv.slice(2);
if (!prePathArg || !finalPathArg) {
  console.error("Usage: node - <prerelease.tgz> <final.tgz>");
  process.exit(2);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sri512 = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const listFiles = (dir, prefix = "") => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
};
const canonicalWithoutVersion = (pkg) => {
  const sortVal = (val) => {
    if (Array.isArray(val)) return val.map(sortVal);
    if (val && typeof val === "object") {
      const sorted = {};
      for (const k of Object.keys(val).sort()) sorted[k] = sortVal(val[k]);
      return sorted;
    }
    return val;
  };
  const copy = { ...pkg };
  delete copy.version;
  return JSON.stringify(sortVal(copy));
};

const prePath = resolve(prePathArg);
const finalPath = resolve(finalPathArg);
const preBytes = readFileSync(prePath);
const finalBytes = readFileSync(finalPath);

const tmp = mkdtempSync(join(tmpdir(), "engram-live-repack-compare-"));
try {
  const preDir = join(tmp, "pre");
  const finalDir = join(tmp, "final");
  mkdirSync(preDir, { recursive: true });
  mkdirSync(finalDir, { recursive: true });
  execFileSync("tar", ["-xf", prePath, "-C", preDir]);
  execFileSync("tar", ["-xf", finalPath, "-C", finalDir]);

  const prePkgDir = join(preDir, "package");
  const finalPkgDir = join(finalDir, "package");
  const preFiles = listFiles(prePkgDir).sort();
  const finalFiles = listFiles(finalPkgDir).sort();
  assert.deepEqual(finalFiles, preFiles, "Packed file inventories differ between prerelease and final tarballs");

  const perFile = [];
  const mismatches = [];
  for (const rel of preFiles) {
    const preHash = sha256(readFileSync(join(prePkgDir, rel)));
    const finalHash = sha256(readFileSync(join(finalPkgDir, rel)));
    if (rel === "package.json") {
      perFile.push({ path: rel, preSha256: preHash, finalSha256: finalHash, status: "manifest-version-only-check" });
      continue;
    }
    const equal = preHash === finalHash;
    perFile.push({ path: rel, preSha256: preHash, finalSha256: finalHash, equal });
    if (!equal) mismatches.push({ path: rel, preSha256: preHash, finalSha256: finalHash });
  }
  assert.equal(mismatches.length, 0, `Non-manifest files differ: ${JSON.stringify(mismatches)}`);

  const prePkg = JSON.parse(readFileSync(join(prePkgDir, "package.json"), "utf8"));
  const finalPkg = JSON.parse(readFileSync(join(finalPkgDir, "package.json"), "utf8"));
  assert.equal(prePkg.name, "@sentropic/engram-live");
  assert.equal(finalPkg.name, "@sentropic/engram-live");
  assert.ok(String(prePkg.version).includes("-"), `Expected prerelease version in pre tarball, got ${prePkg.version}`);
  assert.ok(!String(finalPkg.version).includes("-"), `Expected final non-prerelease version in final tarball, got ${finalPkg.version}`);
  assert.notEqual(prePkg.version, finalPkg.version);

  const preNoVer = canonicalWithoutVersion(prePkg);
  const finalNoVer = canonicalWithoutVersion(finalPkg);
  assert.equal(finalNoVer, preNoVer, "package.json differs in fields other than version");

  const nonManifestTreeLines = perFile
    .filter((entry) => entry.path !== "package.json")
    .map((entry) => `${entry.preSha256}  ${entry.path}\n`)
    .join("");
  const nonManifestFilesTreeSha256 = sha256(Buffer.from(nonManifestTreeLines, "utf8"));

  console.log(JSON.stringify({
    packageName: "@sentropic/engram-live",
    prerelease: {
      version: prePkg.version,
      integrity: sri512(preBytes),
      tarballSha256: sha256(preBytes),
      bytes: preBytes.byteLength,
    },
    final: {
      version: finalPkg.version,
      integrity: sri512(finalBytes),
      tarballSha256: sha256(finalBytes),
      bytes: finalBytes.byteLength,
    },
    entryCount: preFiles.length,
    comparedNonManifestFiles: preFiles.length - 1,
    allNonManifestFilesIdentical: true,
    packageJsonIdenticalWithoutVersion: true,
    packageJsonWithoutVersionSha256: sha256(Buffer.from(preNoVer, "utf8")),
    nonManifestFilesTreeSha256,
    files: perFile,
  }, null, 2));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
EOF
```

---

## 6. Recorded Dry-Run Integrity Record (E-REL / R-E-pre Baseline)

Measured offline after `node scripts/build-live.mjs` and `node scripts/check-live-package.mjs` on top of base `1607fc7d35f7f2abf258accfd75ce499e53896fb` (row 12 `L9-E` merged, PR `#507`) with `engram-live/package.json` versioned at `0.2.0-pre.1`. No package was published and no workflow was triggered.

<!-- E-REL-INTEGRITY-RECORD:START -->
```json
{
  "packageName": "@sentropic/engram-live",
  "version": "0.2.0-pre.1",
  "plannedDistTag": "next",
  "baseCommit": "1607fc7d35f7f2abf258accfd75ce499e53896fb",
  "filename": "sentropic-engram-live-0.2.0-pre.1.tgz",
  "entryCount": 122,
  "size": 1584684,
  "unpackedSize": 14513153,
  "shasum": "ea6bbba066050ce74544024b60d7c8ae7a3d397c",
  "integrity": "sha512-tK5ftSf7MWkzqk5OE2H4xRBZsen19Udg0PKxPAbdakFX9MxnsDvXr37tzcxTJ0U8w7mA/o6JYQpNkXC8BzaSWw==",
  "tarballSha256": "6872af2cd5c47d890c36c4cb8fe87d0e40ef5a0f65d9999983eb0fd8bb4c8633",
  "digests": {
    "dist/contracts.js": "3fde64f86e325d93526bbb6f21ad94dfc07c93644fd4f92027c04dbe3bb9e542",
    "dist/contracts.d.ts": "804c823bcce42776197e168a7df1897036bda878f3b9a823364b3922d2546e98",
    "dist/integration.js": "8694e9da9b67bce0ca884d6a994bd373410f75bf30387f3185e22e02351dc9b2",
    "grammar-manifest.json": "614673f7a2682049ab8d5ef4b1ef540df0f36a8a351e2dfa7a4658eead0a4a35",
    "package.json(without version)": "38584e531e528a4e802ff26b4e1195ecb0ca6d14cfe707defff5d39d5f85d094",
    "nonManifestFilesTreeSha256": "89087d9d14dcb26ddc9fcbbef4a5b0042982e01ba3ce6bca74c90e38a4e5a228",
    "tests/fixtures/live-code-context.json": "87355d2744488b5085d048441d3571618508f9ffa0d8e0ecfef2aa17091af3bf"
  },
  "repackDryRunTarget": {
    "version": "0.2.0",
    "plannedDistTag": "latest",
    "filename": "sentropic-engram-live-0.2.0.tgz",
    "entryCount": 122,
    "size": 1584664,
    "unpackedSize": 14513147,
    "shasum": "a4a0dc1de5ed5310cbe652aaf9b9c358d3929e1e",
    "integrity": "sha512-B3NpRGr2NPE6S7Y8+6rTdPqKVau0E+nNg4tuSRDsKVzVuEUVlPnbGf8uqbwYVw/itLHtNLdCwPV9u5EJW83org==",
    "tarballSha256": "e807466db067e8c96423e2ce22b7ce9e2e725d6f86eca11d1d7240dbf9fa1012",
    "comparedNonManifestFiles": 121,
    "nonManifestDiffs": 0,
    "packageJsonIdenticalWithoutVersion": true
  },
  "toolchain": {
    "node": "v22.22.1",
    "npm": "11.21.1",
    "os": "linux"
  },
  "published": false
}
```
<!-- E-REL-INTEGRITY-RECORD:END -->

> **Digest formats (`nonManifestFilesTreeSha256` & `fixtureSha256`):**
> - `digests.nonManifestFilesTreeSha256` (also emitted as `nonManifestFilesTreeSha256` in the workflow's `release-evidence.json` and the Section 5 comparison output) is the lowercase hex SHA-256 of the UTF-8 concatenation of `sha256sum`-style lines `${sha256}  ${path}\n` (two ASCII spaces between the lowercase hex file SHA-256 and the package-relative POSIX path, with a trailing LF on every line) across all 121 packed entries excluding `package.json`, sorted in lexicographical ASCII code-point order (`Array.prototype.sort()` / `LC_ALL=C sort`).
> - `digests["tests/fixtures/live-code-context.json"]` is the raw file SHA-256 of `tests/fixtures/live-code-context.json`, also emitted as `fixtureSha256` in `release-evidence.json`.
>
> **Note on tarball determinism across toolchains:** Within a fixed Node/npm toolchain, `npm pack --dry-run --json` and `npm pack --json` normalize archive headers and produce byte-identical tarballs and SRI `integrity` digests. When the conductor cuts **R-E-pre** and **R-E** on GitHub Actions (`ubuntu-latest`, Node 24), the authoritative per-file SHA-256 comparison is anchored on the 121 non-manifest file digests (`nonManifestFilesTreeSha256`, defined above), `package.json` without `version`, `fixtureSha256`, and the `release-evidence.json` uploaded by the workflow.
