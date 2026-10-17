import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  readlinkSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LiveProcessTrace, type Phase } from "./live-process-trace.js";

export type ObjectFormat = "sha1" | "sha256";
export type RefFormat = "files" | "reftable";
interface HistorySize { main: number; pr: number }
export const recipe = JSON.parse(readFileSync(new URL("../fixtures/live-git-corpus.json", import.meta.url), "utf8")) as {
  binaryHex: string; rawPathHex: string;
  history: { routine: HistorySize; qualification: HistorySize };
  rootOids: Record<ObjectFormat, string>;
  oracle: Record<string, string>;
};

export class LiveGitSandbox {
  readonly root: string;
  readonly trace: LiveProcessTrace;
  constructor(parent = resolve(dirname(fileURLToPath(import.meta.url)), "../../.h2a/live-git-fixtures")) {
    // Default: ignored fixture space. Callers may select an OS-temp parent
    // when every fixture/clone must be outside observed worktrees.
    mkdirSync(parent, { recursive: true });
    this.root = mkdtempSync(join(parent, "l0-"));
    try {
      mkdirSync(join(this.root, "disabled-hooks"));
      mkdirSync(join(this.root, "empty-template"));
      this.trace = new LiveProcessTrace(this.root);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  probe(cwd: string, args: string[], phase: Phase = "setup", input?: Buffer | string) {
    return this.trace.run(cwd, args, input, phase);
  }
  git(cwd: string, args: string[], input?: Buffer | string, phase: Phase = "setup"): Buffer {
    const result = this.probe(cwd, args, phase, input);
    if (result.status !== 0) throw new Error(`L0 git ${args.join(" ")} failed (${result.status}): ${result.stderr}`);
    return result.stdout;
  }
  read(cwd: string, args: string[], input?: Buffer | string): Buffer { return this.git(cwd, args, input, "oracle"); }
  init(path: string, objectFormat: ObjectFormat = "sha1", refFormat: RefFormat = "files") {
    this.git(this.root, ["init", "-q", "--initial-branch=main", `--object-format=${objectFormat}`,
      `--ref-format=${refFormat}`, `--template=${join(this.root, "empty-template")}`, path]);
    return path;
  }
  dispose() { rmSync(this.root, { recursive: true, force: true }); }
}

/** Independent read-side corpus. All writes are fixture setup, outside any
 * observed worktree. No engram-live producer supplies objects or expectations.
 * F_* aliases are synthetic controls, never the H/S revisions in analysis C. */
export function buildReadSideFixtures(box: LiveGitSandbox) {
  const h2a = box.init(join(box.root, "h2a-control"));
  const sentropic = box.init(join(box.root, "sentropic-control"));
  const pins: Record<string, string> = {};
  let tick = 0;
  const commit = (repo: string, name: string, files: Record<string, string>, parents: string[], message: string) => {
    const entries = Object.entries(files).map(([path, content]) => ({ path: Buffer.from(path), mode: "100644",
      oid: box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], content).toString().trim() }));
    const date = `${1700000000 + tick++ * 86400} +0000`;
    const result = box.trace.run(repo, ["commit-tree", writeTree(box, repo, entries),
      ...parents.flatMap(parent => ["-p", pins[parent]])], message + "\n", "setup",
    { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    if (result.status !== 0) throw new Error(`read-side fixture commit failed: ${result.stderr}`);
    pins[name] = result.stdout.toString().trim();
  };
  const dto = "export interface WorkspaceDeclarationDto { repository: string; worktree: string }\n";
  const initial: Record<string, string> = {
    "src/delegate.ts": "export function resolveJobCwd(jobPath: string) { return jobPath; }\n",
    "tests/delegate.test.ts": "// delegate base behavior\n",
    "tests/delegate-cleanup.test.ts": "// cleanup base behavior\n",
    "src/live-contract.ts": "export const transport = 'none';\nexport const retention = 'none';\n",
    "src/live-registration.ts": "// L7a: only a verified principal can grant local authority.\nexport function localAuthority(verifiedPrincipal: boolean) { return verifiedPrincipal; }\n",
    "src/memory.ts": "// Refusal is a typed unavailable result; an authorized empty result has items: [].\nexport function recallMemory(authorized: boolean) { return authorized ? { state: 'complete', items: [] } : { state: 'unauthorized' }; }\n",
    "src/workspace-contract.ts": dto,
    "src/consumer.ts": "import type { WorkspaceDeclarationDto } from './workspace-contract.js';\nexport type Consumer = WorkspaceDeclarationDto;\n",
    "staging/agent-stats/index.ts": "export const agentStats = 'local fixture';\n",
  };
  commit(h2a, "F_H0", initial, [], "Initialize the h2a investigation control");
  const detached: Record<string, string> = { ...initial,
    "src/delegate.ts": "export function resolveJobCwd(jobPath: string) { return ['worktree', 'add', '--detach', jobPath, 'HEAD']; }\n",
    "tests/delegate.test.ts": "// detached worktree behavior\n" };
  commit(h2a, "F_DETACH", detached, ["F_H0"], "Use detached worktrees");
  const moved: Record<string, string> = { ...detached, "packages/agent-stats/index.ts": initial["staging/agent-stats/index.ts"]!,
    "tests/delegate-cleanup.test.ts": "// detached cleanup behavior\n" };
  delete moved["staging/agent-stats/index.ts"];
  commit(h2a, "F_H", moved, ["F_DETACH"], "Move staged agent stats to packages/agent-stats");
  commit(h2a, "F_HP", { ...moved,
    "src/live-contract.ts": "export const transport = 'metadata';\nexport const retention = 'none';\n",
    "src/live-github.ts": "// PR metadata only; Git objects use a separate transport.\nexport const pullRequestFields = ['number', 'title', 'headOid'];\n" }, ["F_H"], "Add pull request metadata transport; exclude Git object acquisition");
  commit(h2a, "F_HR", { ...moved,
    "src/live-contract.ts": "export const transport = 'none';\nexport const retention = 'private';\n",
    "src/live-retention.ts": "// Private retained refs survive source branch deletion. Installed qualification has not run.\nexport const retainedPrefix = 'refs/private/retained/';\n" }, ["F_H"], "Retain private objects independently of source branches; qualification unverified");
  const storage = {
    "src/live-storage/registration.ts": "export const POLICY_VERSION = 'live-policy/1';\nexport function removeScope() { return { state: 'failed', retryable: false }; }\n",
    "src/workspace-contract.ts": dto,
    "src/consumer.ts": "import type { WorkspaceDeclarationDto } from './workspace-contract.js';\nexport type Consumer = WorkspaceDeclarationDto;\n",
    "src/dynamic-consumer.ts": "export const loadContract = (name: string) => import(name);\n",
    "docs/storage.md": "Superseded: the application implements reusable Postgres storage.\nL3a v4.1: cluster-mesh owns the generic kernel and both reusable backends. The application injects and operates Postgres.\n",
  };
  commit(sentropic, "F_S0", storage, [], "Introduce versioned storage registration");
  const retryable = { ...storage,
    "src/live-storage/registration.ts": "export const POLICY_VERSION = 'live-policy/1';\nexport function removeScope() { return { state: 'failed', retryable: true }; }\n",
    "tests/removal.test.ts": "// Assert removal failure can be retried.\n" };
  commit(sentropic, "F_S", retryable, ["F_S0"], "Make failed scope removal retryable");
  const visibility: Record<string, string> = { ...retryable,
    "src/visibility.ts": "// Repository-scoped visibility root.\n// This control has an exact function body.\nexport function scopeVisibilityRoot() { return 'authorized'; }\n" };
  commit(sentropic, "F_K3", visibility, ["F_S"], "Add development visibility root");
  const renamed: Record<string, string> = { ...visibility,
    "src/scope-visibility.ts": visibility["src/visibility.ts"]!.replace("scopeVisibilityRoot", "ScopeVisibilityRoot"),
    "tests/visibility.test.ts": "// A visibility root is scoped to the authorized repository.\n" };
  delete renamed["src/visibility.ts"];
  commit(sentropic, "F_K4", renamed, ["F_K3"], "Rename and move the visibility root on the development branch");
  commit(h2a, "F_JOIN", { ...moved,
    "src/live-contract.ts": "export const transport = 'metadata';\nexport const retention = 'private';\n",
    "src/live-github.ts": "// PR metadata only; Git objects use a separate transport.\nexport const pullRequestFields = ['number', 'title', 'headOid'];\n",
    "src/live-retention.ts": "// Private retained refs survive source branch deletion. Installed qualification has not run.\nexport const retainedPrefix = 'refs/private/retained/';\n",
  }, ["F_HP", "F_HR"], "Merge topic contributions in an isolated control");
  // One main tip per repository; neither topic is silently integrated into it.
  box.git(h2a, ["update-ref", "refs/heads/main", pins.F_H]);
  box.git(sentropic, ["update-ref", "refs/heads/main", pins.F_S]);
  return { h2a, sentropic, pins };
}

/** Local-only, independent object copy. No checkout, alternates, hardlinks,
 * lazy fetch or repository program; the observed source receives no writes.
 * Git 2.53 advertises local refs through its native upload-pack child. Keep
 * clone setup in its own trace; oracle commands still require zero children. */
export function cloneReadSideSource(box: LiveGitSandbox, source: string) {
  if (source !== "/home/antoinefa/src/graphify") throw new Error("read-side source is not authorized");
  const repo = join(box.root, "engram-history");
  const setup = join(box.root, "clone-setup");
  mkdirSync(join(setup, "disabled-hooks"), { recursive: true });
  const trace = new LiveProcessTrace(setup);
  const result = trace.run(box.root, ["-c", "protocol.file.allow=always", "clone", "--local", "--no-hardlinks", "--no-checkout",
    `--template=${join(box.root, "empty-template")}`, source, repo]);
  if (result.status !== 0) throw new Error(`read-side local clone failed: ${result.stderr}`);
  const events = readFileSync(trace.path, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const children = events.filter(event => event.event === "child_start");
  if (children.length > 1 || children.some(event => event.child_class !== "transport/file" ||
    JSON.stringify(event.argv) !== JSON.stringify([`git-upload-pack '${source}/.git'`]))) {
    throw new Error("read-side clone launched an unexpected process");
  }
  const exits = events.filter(event => event.event === "exit");
  if (exits.length !== 1 + children.length || exits.some(event => event.code !== 0)) {
    throw new Error("read-side clone trace is incomplete");
  }
  return repo;
}

export function detectGitCapabilities(box: LiveGitSandbox) {
  const version = box.git(box.root, ["--version"]).toString().trim();
  const objectFormats: ObjectFormat[] = [];
  const refFormats: RefFormat[] = [];
  const unsupported: Record<string, string> = {};
  for (const [kind, values] of [["object", ["sha1", "sha256"]], ["ref", ["files", "reftable"]]] as const) {
    for (const value of values) {
      const path = join(box.root, `probe-${value}`);
      const result = box.probe(box.root, ["init", "-q", "--initial-branch=main",
        `--${kind}-format=${value}`, `--template=${join(box.root, "empty-template")}`, path]);
      if (result.status === 0) {
        const detected = box.git(path, ["rev-parse", `--show-${kind}-format`]).toString().trim();
        if (detected !== value) throw new Error(`L0 ${kind} format probe returned ${detected}, expected ${value}`);
        if (kind === "object") objectFormats.push(value as ObjectFormat);
        else refFormats.push(value as RefFormat);
      } else if (/unknown option|unknown hash algorithm|unknown .*format|unsupported .*format|not supported/i.test(result.stderr.toString())) {
        unsupported[value] = result.stderr.toString().split("\n")[0];
      } else {
        throw new Error(`L0 ${value} capability probe failed (not an unsupported capability): ${result.stderr}`);
      }
    }
  }
  if (!objectFormats.includes("sha1") || !refFormats.includes("files")) throw new Error("L0 requires SHA-1 and files refs");
  return { version, objectFormats, refFormats, unsupported };
}

interface Entry { path: Buffer; mode: string; oid: string; content?: Buffer }
export interface GitCorpus {
  root: string; repo: string; empty: string; shallow: string; sparse: string;
  linked: string; detached: string; tripwireMarker: string;
  commits: Record<string, string>; blobs: Record<string, string>;
}

/** Build trees through NUL-delimited plumbing, never git add/clean/smudge. */
function writeTree(box: LiveGitSandbox, repo: string, entries: Entry[]): string {
  const records: Buffer[] = [];
  const directories = new Map<string, Entry[]>();
  for (const entry of entries) {
    const slash = entry.path.indexOf(47);
    if (slash !== -1) {
      const name = entry.path.subarray(0, slash).toString("hex");
      const children = directories.get(name) ?? [];
      children.push({ ...entry, path: entry.path.subarray(slash + 1) });
      directories.set(name, children);
    } else {
      const type = entry.mode === "160000" ? "commit" : "blob";
      records.push(Buffer.concat([Buffer.from(`${entry.mode} ${type} ${entry.oid}\t`), entry.path, Buffer.from([0])]));
    }
  }
  for (const [name, children] of directories) {
    records.push(Buffer.concat([Buffer.from(`040000 tree ${writeTree(box, repo, children)}\t`), Buffer.from(name, "hex"), Buffer.from([0])]));
  }
  return box.git(repo, ["mktree", "-z"], Buffer.concat(records)).toString().trim();
}

function materialize(repo: string, entries: Entry[], omitted?: string) {
  for (const entry of entries) {
    if (entry.path.toString() === omitted || entry.mode === "160000") continue;
    const path = Buffer.concat([Buffer.from(repo + "/"), entry.path]);
    mkdirSync(path.subarray(0, path.lastIndexOf(47)), { recursive: true });
    if (entry.mode === "120000") symlinkSync(entry.content!.toString(), path);
    else writeFileSync(path, entry.content!, { mode: entry.mode === "100755" ? 0o755 : 0o644 });
  }
}

export function buildCorpus(box: LiveGitSandbox, format: ObjectFormat, refs: RefFormat): GitCorpus {
  const root = join(box.root, `corpus-${format}-${refs}`);
  mkdirSync(root);
  const repo = box.init(join(root, "repo"), format, refs);
  const commits: Record<string, string> = {};
  const blobs: Record<string, string> = {};
  const blob = (name: string, content: Buffer | string) => {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const oid = box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], bytes).toString().trim();
    blobs[name] = oid;
    return { oid, content: bytes };
  };
  const commit = (name: string, tree: string, parents: string[] = []) => {
    const oid = box.git(repo, ["commit-tree", tree, ...parents.flatMap(parent => ["-p", commits[parent]])], `${name}\n`).toString().trim();
    commits[name] = oid;
    return oid;
  };
  commit("unrelated", writeTree(box, repo, []));
  const entries: Entry[] = [];
  const file = (name: string, path: string | Buffer, content: Buffer | string, mode = "100644") => {
    entries.push({ path: Buffer.isBuffer(path) ? path : Buffer.from(path), mode, ...blob(name, content) });
  };
  file("attributes", ".gitattributes", "filtered.dat filter=tripwire diff=tripwire\nbinary.dat -diff\n");
  file("protected", ".env", "FIXTURE_SECRET=protected\n");
  file("workflow", ".github/workflows/ci.yml", "name: fixture\n");
  file("binary", "binary.dat", Buffer.from(recipe.binaryHex, "hex"));
  file("base", "conflict.txt", "base\n");
  file("deleted", "deleted.txt", "delete me\n");
  file("filtered", "filtered.dat", "raw filtered bytes\n");
  file("link", "link", "../outside-secret", "120000");
  file("renamed", "old.txt", "rename without edits\n");
  file("script", "run.sh", "#!/bin/sh\nexit 0\n");
  file("sparse", "sparse/omitted.txt", "sparse content\n");
  file("nonUtf8", Buffer.from(recipe.rawPathHex, "hex"), "non UTF-8 path\n");
  file("unusual", "tab\tline\n.txt", "unusual path\n");
  entries.push({ path: Buffer.from("vendor/submodule"), mode: "160000", oid: commits.unrelated });
  const rootTree = writeTree(box, repo, entries);
  commit("root", rootTree);
  const changeConflict = (name: string, content = `${name}\n`) => entries.map(entry => entry.path.equals(Buffer.from("conflict.txt"))
    ? { ...entry, ...blob(name, content) } : entry);
  commit("left", writeTree(box, repo, changeConflict("left")), ["root"]);
  // Different deletion counts make substituting the first parent observable.
  commit("right", writeTree(box, repo, changeConflict("right", "right\nright-only\n")), ["root"]);
  commit("third", rootTree, ["root"]);
  const merged = changeConflict("merged");
  const mergeTree = writeTree(box, repo, merged);
  commit("merge", mergeTree, ["left", "right"]);
  commit("octopus", mergeTree, ["left", "right", "third"]);
  commit("joinedRoots", rootTree, ["root", "unrelated"]);
  const mainEntries = merged.filter(entry => !entry.path.equals(Buffer.from("deleted.txt"))).map(entry => {
    if (entry.path.equals(Buffer.from("old.txt"))) return { ...entry, path: Buffer.from("new.txt") };
    if (entry.path.equals(Buffer.from("run.sh"))) return { ...entry, mode: "100755" };
    if (entry.path.equals(Buffer.from("binary.dat"))) return { ...entry, ...blob("binaryChanged", Buffer.from([0, 9, 255, 10])) };
    if (entry.path.equals(Buffer.from("filtered.dat"))) return { ...entry, ...blob("filteredChanged", "changed raw filtered bytes\n") };
    return entry;
  });
  commit("main", writeTree(box, repo, mainEntries), ["octopus"]);
  blobs.releaseTag = box.git(repo, ["hash-object", "-t", "tag", "-w", "--stdin"],
    `object ${commits.merge}\ntype commit\ntag release\ntagger L0 Fixture <l0@example.invalid> 1700000000 +0000\n\nrelease\n`).toString().trim();
  const targets: Record<string, string> = {
    "refs/heads/main": commits.main, "refs/heads/topic": commits.right, "refs/heads/linked": commits.main,
    "refs/heads/joined-roots": commits.joinedRoots,
    "refs/remotes/origin/main": commits.root, "refs/remotes/origin/topic": commits.third,
    "refs/pull/1/head": commits.right, "refs/pull/2/head": commits.left, "refs/pull/3/head": commits.merge,
    "refs/tags/v0": commits.root, "refs/tags/release": blobs.releaseTag,
  };
  box.git(repo, ["update-ref", "--stdin"], Object.entries(targets).map(([ref, oid]) => `update ${ref} ${oid}\n`).join(""));
  box.git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  box.git(repo, ["read-tree", commits.main]);
  materialize(repo, mainEntries.filter(entry => entry.path.toString() !== "conflict.txt"));
  writeFileSync(join(repo, "conflict.txt"), "unstaged conflict\n");
  box.git(repo, ["update-index", "--index-info"],
    `0 ${"0".repeat(commits.root.length)}\tconflict.txt\n` +
    ["base", "left", "right"].map((name, index) => `100644 ${blobs[name]} ${index + 1}\tconflict.txt\n`).join(""));
  const staged = blob("staged", "staged rename\n");
  box.git(repo, ["update-index", "--index-info"], `100644 ${staged.oid} 0\tnew.txt\n`);
  writeFileSync(join(repo, "new.txt"), "unstaged rename\n");
  const linked = join(root, "linked");
  const detached = join(root, ".h2a", "jobs", "l0", "wt");
  const sparse = join(root, "sparse");
  box.git(repo, ["worktree", "add", "--quiet", "--no-checkout", linked, "linked"]);
  box.git(repo, ["worktree", "add", "--quiet", "--no-checkout", "--detach", detached, commits.merge]);
  box.git(repo, ["worktree", "add", "--quiet", "--no-checkout", "--detach", sparse, commits.main]);
  for (const path of [linked, detached, sparse]) box.git(path, ["read-tree", "HEAD"]);
  materialize(linked, mainEntries);
  materialize(detached, merged);
  materialize(sparse, mainEntries, "sparse/omitted.txt");
  box.git(repo, ["config", "extensions.worktreeConfig", "true"]);
  box.git(sparse, ["config", "--worktree", "core.sparseCheckout", "true"]);
  const sparseGitDir = box.git(sparse, ["rev-parse", "--absolute-git-dir"]).toString().trim();
  mkdirSync(join(sparseGitDir, "info"), { recursive: true });
  writeFileSync(join(sparseGitDir, "info", "sparse-checkout"), "/*\n!/sparse/\n");
  box.git(sparse, ["update-index", "--skip-worktree", "--", "sparse/omitted.txt"]);
  box.git(repo, ["pack-refs", "--all", "--prune"]);
  const empty = box.init(join(root, "empty"), format, refs);
  const shallow = box.init(join(root, "shallow"), format, refs);
  cpSync(join(repo, ".git", "objects"), join(shallow, ".git", "objects"), { recursive: true });
  box.git(shallow, ["update-ref", "refs/heads/main", commits.main]);
  writeFileSync(join(shallow, ".git", "shallow"), `${commits.main}\n`);
  writeFileSync(join(root, "outside-secret"), "must not follow symlink\n");

  // Negative fixtures only; never invoke them, including in mutation checks.
  const hooks = join(repo, "tripwire-hooks");
  mkdirSync(hooks);
  const tripwireMarker = join(repo, "PROGRAM_RAN");
  const program = "#!/bin/sh\n# L0 forbidden repository program\nprintf 'invoked\\n' > PROGRAM_RAN\nexit 97\n";
  const command = join(hooks, "tripwire");
  for (const name of ["tripwire", "post-checkout", "post-index-change", "reference-transaction", "pre-commit"]) {
    writeFileSync(join(hooks, name), program, { mode: 0o755 });
  }
  const quotedCommand = `'${command.replaceAll("'", "'\\''")}'`;
  for (const [key, value] of Object.entries({
    "core.hooksPath": hooks, "core.fsmonitor": command,
    "filter.tripwire.clean": quotedCommand, "filter.tripwire.smudge": quotedCommand,
    "filter.tripwire.process": quotedCommand, "filter.tripwire.required": "true",
    "diff.tripwire.textconv": quotedCommand, "diff.external": quotedCommand,
  })) box.git(repo, ["config", key, value]);
  return { root, repo, empty, shallow, sparse, linked, detached, tripwireMarker, commits, blobs };
}

export function observeCorpus(box: LiveGitSandbox, corpus: GitCorpus): Record<string, Buffer> {
  const read = (args: string[]) => box.read(corpus.repo, args);
  const diff = ["diff-tree", "--no-ext-diff", "--no-textconv", "--no-commit-id", "-r", "-z", "--no-renames"];
  const result: Record<string, Buffer> = {
    refs: read(["for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(symref)"]),
    conflicts: read(["ls-files", "--unmerged", "-z"]),
    staged: read(["ls-files", "--stage", "-z", "--", "new.txt"]),
    rootNames: read([...diff, "--root", "--name-status", corpus.commits.root]),
    changes: read([...diff, "--find-renames=100%", "--name-status", corpus.commits.octopus, corpus.commits.main]),
    numstat: read([...diff, "--find-renames=100%", "--numstat", corpus.commits.octopus, corpus.commits.main]),
    filteredPatch: read([...diff, "-p", "--full-index", corpus.commits.root, corpus.commits.main, "--", "filtered.dat"]),
    modeChange: read([...diff, "--raw", "--no-abbrev", corpus.commits.octopus, corpus.commits.main, "--", "run.sh"]),
    modes: read(["ls-tree", "-rz", corpus.commits.main, "--", "link", "run.sh", "vendor/submodule"]),
    worktrees: read(["worktree", "list", "--porcelain", "-z"]),
  };
  for (const name of ["root", "unrelated", "merge", "octopus", "joinedRoots"]) {
    result[`parents.${name}`] = read(["rev-list", "--parents", "--no-walk", corpus.commits[name]]);
  }
  for (const parent of ["left", "right"]) {
    result[`merge.${parent}`] = read([...diff, "--numstat", corpus.commits[parent], corpus.commits.merge]);
  }
  return result;
}

/** Only sandbox paths and algorithm-specific OIDs are symbolized. latin1 maps
 * one byte to one codepoint; UTF-8 would erase invalid path bytes.
 * Expected bytes are frozen, never learned from the current actual output.
 */
export function normalizeOracle(actual: Record<string, Buffer>, corpus: GitCorpus): Record<string, string> {
  const aliases = [...Object.entries(corpus.commits), ...Object.entries(corpus.blobs)];
  return Object.fromEntries(Object.entries(actual).map(([name, bytes]) => {
    let value = bytes.toString("latin1").replaceAll(Buffer.from(corpus.root).toString("latin1"), "<corpus>");
    for (const [alias, oid] of aliases) value = value.replaceAll(oid, `<${alias}>`);
    return [name, value];
  }));
}

/** Digest byte paths, types, permissions and content without following links.
 * Includes objects/config/refs/index and ignored/untracked files, excludes atime.
 */
export function inventoryDigest(corpus: { root: string }): string {
  const hash = createHash("sha256");
  const visit = (path: Buffer) => {
    const stat = lstatSync(path);
    hash.update(path).update(`\0${stat.mode}\0`);
    if (stat.isSymbolicLink()) hash.update(readlinkSync(path, { encoding: "buffer" }));
    else if (stat.isDirectory()) {
      for (const name of readdirSync(path, { encoding: "buffer" }).sort(Buffer.compare)) {
        visit(Buffer.concat([path, Buffer.from("/"), name]));
      }
    } else hash.update(readFileSync(path));
    hash.update("\0");
  };
  visit(Buffer.from(corpus.root));
  return hash.digest("hex");
}

/** G1 oracle fixture: only native Git constructs objects; the observed clone
 * and its linked worktree are never used as the producer's object store. */
export function buildLineAttributionFixture(box: LiveGitSandbox, format: ObjectFormat = "sha1") {
  const root = join(box.root, `line-${format}`);
  mkdirSync(root);
  const repo = box.init(join(root, "observed"), format);
  const rawPath = Buffer.concat([Buffer.from("-$(touch G1_EXECUTED);"), Buffer.from("6f726967696e2dfffe09220a", "hex")]);
  const a = ["alpha original declaration with enough distinct characters", "beta original declaration with enough distinct characters", "gamma original declaration with enough distinct characters"];
  const b = ["delta independent implementation with enough distinct characters", "epsilon independent implementation with enough distinct characters", "zeta independent implementation with enough distinct characters"];
  const c = ["eta final section with enough distinct characters", "theta final section with enough distinct characters", "iota final section with enough distinct characters"];
  const commits: Record<string, string> = {};
  const make = (name: string, files: [Buffer | string, string[]][], parents: string[] = []) => {
    const entries = files.map(([path, lines]) => ({ path: Buffer.from(path), mode: "100644",
      oid: box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], lines.join("\n") + "\n").toString().trim() }));
    const result = box.trace.run(repo, ["commit-tree", writeTree(box, repo, entries),
      ...parents.flatMap(parent => ["-p", commits[parent]])], `${name}\n`, "setup", {
      GIT_AUTHOR_NAME: `G1 ${name}`, GIT_AUTHOR_EMAIL: `${name}@example.invalid`,
      GIT_AUTHOR_DATE: `1700000000 ${name === "left" ? "+0530" : name === "right" ? "-0330" : "+0000"}`,
    });
    if (result.status !== 0) throw new Error(`G1 native commit failed: ${result.stderr}`);
    commits[name] = result.stdout.toString().trim();
  };
  make("root", [[rawPath, [...a, ...b, ...c]], ["nested/inner.txt", a]]);
  const left = [a[0], "left parent changed this particular original declaration", a[2], ...b, ...c];
  const right = [...a, b[0], "right parent changed this independent implementation", b[2], ...c];
  make("left", [[rawPath, left]], ["root"]);
  make("right", [[rawPath, right]], ["root"]);
  const merged = [...left.slice(0, 3), ...right.slice(3, 6), ...c, "merge resolution introduced by the ordered parent merge"];
  make("merge", [[rawPath, merged]], ["left", "right"]);
  make("rename", [["renamed.txt", merged]], ["merge"]);
  const moved = [...c, ...merged.slice(0, 6), merged[9]];
  make("move", [["renamed.txt", moved]], ["rename"]);
  make("copy", [["renamed.txt", moved], ["copied.txt", [...moved, "copy commit adds its own independent declaration"]]], ["move"]);
  box.git(repo, ["update-ref", "refs/heads/main", commits.copy]);
  box.git(repo, ["read-tree", commits.copy]);
  writeFileSync(join(repo, "untracked.txt"), "untracked bytes must remain\n");
  const linked = join(root, "linked");
  box.git(repo, ["worktree", "add", "--quiet", "--no-checkout", "--detach", linked, commits.merge]);
  const privateRoot = join(box.root, `retained-${format}`);
  mkdirSync(privateRoot);
  const stores: Record<string, string> = {};
  for (const name of ["complete", "shallow", "missing", "missing-blob", "external-config"]) {
    const cwd = box.init(join(privateRoot, name), format);
    cpSync(join(repo, ".git", "objects"), join(cwd, ".git", "objects"), { recursive: true });
    stores[name] = cwd;
    // Repository-controlled conversions are declarations only, never canaries.
    // The producer must override diff/quoting defaults.
    for (const [key, value] of [["diff.algorithm", "patience"],
      ["diff.indentHeuristic", "true"], ["core.quotePath", "false"]]) box.git(cwd, ["config", key, value]);
  }
  box.git(stores["external-config"], ["config", "blame.ignoreRevsFile", "must-not-open"]);
  writeFileSync(join(stores.shallow, ".git", "shallow"), `${commits.merge}\n`);
  const removeObject = (store: string, oid: string) => rmSync(join(stores[store], ".git", "objects", oid.slice(0, 2), oid.slice(2)));
  removeObject("missing", commits.root);
  const rootBlob = box.read(repo, ["ls-tree", "-rz", commits.root]).toString("latin1").split("\t")[0].split(" ")[2];
  removeObject("missing-blob", rootBlob);
  return { root, repo, linked, privateRoot, stores, rawPath, commits, format };
}

/** Independent native oracle. No producer parser, argument builder or result
 * is used to derive expectations. printf receives octal bytes as data only. */
export function nativeLineOracle(box: LiveGitSandbox, cwd: string, oid: string, path: Buffer,
  ranges: readonly { start: number; end: number }[], detectionFlags: readonly string[] = []) {
  const args = ["blame", "--root", "--line-porcelain", "--no-textconv", "--encoding=none", "--ignore-revs-file", "",
    "--diff-algorithm=myers", "--no-indent-heuristic",
    ...detectionFlags,
    ...ranges.flatMap(range => ["-L", `${range.start},${range.end}`]), oid, "--"];
  // Native Git can take arbitrary argv bytes; Node string argv cannot. The
  // fixed system shell performs only byte decoding and exec, never eval.
  const encoded = [...path].map(byte => `\\0${byte.toString(8).padStart(3, "0")}`).join("");
  const result = spawnSync("/bin/sh", ["-c", 'p=$(printf "%bX" "$1"); shift; exec "$@" "${p%X}"', "oracle", encoded,
    box.trace.executable, "--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "protocol.allow=never", ...args], {
    cwd, env: { PATH: "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1", LC_ALL: "C" }, encoding: "latin1",
  });
  if (result.status !== 0) throw new Error(`native blame oracle failed: ${result.stderr}`);
  const decode = (value: string) => value.startsWith('"')
    ? Buffer.from(value.slice(1, -1).replace(/\\([0-7]{3}|[abtnvfr"\\])/g, (_, escape: string) =>
      String.fromCharCode(/^[0-7]/.test(escape) ? parseInt(escape, 8) : ({ a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 }[escape]!))), "latin1")
    : Buffer.from(value, "latin1");
  return [...result.stdout.matchAll(/^([a-f0-9]{40,64}) (\d+) (\d+)(?: \d+)?\n([\s\S]*?)\n\t/gm)].map(match => ({
    commit: match[1], original: Number(match[2]), final: Number(match[3]),
    pathHex: decode(/^filename (.*)$/m.exec(match[4])![1]).toString("hex"),
    author: /^author (.*)$/m.exec(match[4])![1],
  }));
}

/** Same streamed fast-import recipe at both tiers; every commit changes a file.
 * No network, per-commit subprocess, empty-commit trick or checked-in packs.
 */
export async function buildHistory(box: LiveGitSandbox, size: HistorySize) {
  if (!Number.isSafeInteger(size.main) || size.main < 2 || !Number.isSafeInteger(size.pr) || size.pr < 1) {
    throw new Error("L0 history requires main >= 2 and PR >= 1");
  }
  const repo = box.init(join(box.root, `history-${size.main}-${size.pr}`));
  const baseMark = Math.floor(size.main / 2);
  function* commands() {
    yield "feature done\n";
    let mark = 0;
    for (const [ref, count] of [["refs/heads/main", size.main], ["refs/pull/1/head", size.pr]] as const) {
      for (let index = 0; index < count; index++) {
        mark++;
        const message = `${ref} ${index}\n`;
        const content = `history ${mark}\n`;
        yield `commit ${ref}\nmark :${mark}\ncommitter L0 Fixture <l0@example.invalid> ${1700000000 + mark} +0000\ndata ${Buffer.byteLength(message)}\n${message}` +
          (index === 0 && ref !== "refs/heads/main" ? `from :${baseMark}\n` : "") +
          `M 100644 inline history.txt\ndata ${Buffer.byteLength(content)}\n${content}\n`;
      }
    }
    yield `reset refs/tags/pr-base\nfrom :${baseMark}\n\ndone\n`;
  }
  await box.trace.stream(repo, ["fast-import", "--quiet", "--date-format=raw", "--done"], commands());
  const base = box.read(repo, ["rev-parse", "refs/tags/pr-base"]).toString().trim();
  return { repo, base };
}
