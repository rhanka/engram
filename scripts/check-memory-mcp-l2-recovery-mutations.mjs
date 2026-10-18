/** Serial, local mutation proof: no install, network, provider or dependency. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const suite = 'tests/memory-mcp-l2-canonical-recovery.test.ts';
const directory = mkdtempSync(join(tmpdir(), 'memory-l2-recovery-mutations-'));
const writes = 'src/memory-tools/writes.ts';
const policy = 'src/mcp/memory/policy.ts';
const engine = 'engram-memory/engine.ts';
const cases = [
  {
    id: 'committed-confirmation', file: engine, pattern: 'withdraw .*committed=true',
    from: '      if (fromState.value === replayTarget) {',
    to: '      if (beforeFirstEffect !== undefined && await beforeFirstEffect() !== true) return refusal(input.operation, "UNAUTHORIZED", "mutant gates committed proof");\n      if (fromState.value === replayTarget) {',
  },
  {
    id: 'uncommitted-confirmation', file: writes, pattern: 'withdraw .*committed=false',
    from: '    if (approved !== true) {', to: '    if (false && approved !== true) {',
  },
  {
    id: 'committed-policy', file: policy, pattern: 'requestAdmission .*committed=true',
    from: "  if (existing.recovery_state === 'executing_unknown_outcome') {",
    to: "  if (existing.recovery_state === 'executing_unknown_outcome' && existing.policy_versions.tool_name === 'engram_memory_request_admission' && existing.policy_versions.admission_policy_version !== incoming.active_domain_policy_version) return { decision: 'reject', error_code: 'POLICY_STALE', retriable: true };\n  if (existing.recovery_state === 'executing_unknown_outcome') {",
  },
  {
    id: 'uncommitted-policy', file: writes, pattern: 'requestAdmission .*committed=false',
    from: '      if (stale) {', to: '      if (false && stale) {',
  },
];
const env = { ...process.env, npm_config_offline: 'true' };
const run = (args) => spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', suite, ...args], { env, encoding: 'utf8' });
const results = [];
try {
  const baseline = run([]);
  if (baseline.status !== 0) throw Error('Baseline failed:\n' + baseline.stdout + baseline.stderr);
  for (const mutation of cases) {
    const original = readFileSync(mutation.file, 'utf8');
    if (original.split(mutation.from).length !== 2) throw Error('Nonunique mutation anchor: ' + mutation.id);
    const output = join(directory, mutation.id + '.json');
    try {
      writeFileSync(mutation.file, original.replace(mutation.from, () => mutation.to));
      const mutant = run(['-t', mutation.pattern, '--reporter=json', '--outputFile', output]);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      const failed = report.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed').map(test => test.fullName));
      const killed = mutant.status !== 0 && failed.length === 1;
      results.push({ id: mutation.id, killed, failed });
      process.stdout.write(`${killed ? 'KILLED' : 'SURVIVED'} ${mutation.id}: ${failed.join('; ')}\n`);
    } finally { writeFileSync(mutation.file, original); }
  }
  const restored = run([]);
  if (restored.status !== 0) throw Error('Restored baseline failed:\n' + restored.stdout + restored.stderr);
  const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const lines = [
    '# MCP-L2 canonical recovery proof', '',
    'Oracle: SPEC-memory-mcp-v3.2.md M4 l.583–587; M5 l.702, 708–710, 730, 744.', '',
    'Baseline at c5df0798: 4 committed cases RED, 4 uncommitted cases GREEN.',
    'The same matrix now passes 8/8. Every case closes and reopens both canonical and host SQLite stores and creates a fresh engine with stateless test custody.',
    'The assertions require unchanged canonical cursors, zero second writes, no policy decision, and no confirmation ceremony for committed results.', '',
    'Reproduce: `node scripts/check-memory-mcp-l2-recovery-mutations.mjs`.',
    'Mutations run serially against production source; every source is restored in `finally`.',
    'A kill requires one actual failed matrix assertion; compilation or suite-load errors do not count.', '',
    `Result: **${results.filter(result => result.killed).length}/${results.length} killed**; restored baseline 8/8.`, '',
    '| Mutation | Result | Failing test |', '|---|---|---|',
    ...results.map(result => `| ${result.id} | ${result.killed ? 'killed' : 'SURVIVED'} | ${result.failed.join('; ')} |`),
    '', 'Restored source SHA-256:', '',
    ...[engine, policy, writes].map(file => `- \`${file}\`: \`${sha(file)}\``), '',
    'Additional coverage: current host/neutral authorization after SQLite reopen (8 cases), and current confirmation/policy after asynchronous dependencies before commit (4 cases).', '',
  ];
  writeFileSync('spec/MCP_L2_RECOVERY_PROOF.md', lines.join('\n'));
  if (results.some(result => !result.killed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
