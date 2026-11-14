import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const skills = new URL('../src/skills/', import.meta.url);
const source = readFileSync(new URL('multi-links-portable.cjs', skills), 'utf8').trimEnd();
const begin = '<!-- multi-links portable begin -->';
const end = '<!-- multi-links portable end -->';
const block = `${begin}\n\x60\x60\x60javascript\n${source}\n\x60\x60\x60\n${end}`;
const check = process.argv.includes('--check');
let stale = false;
for (const name of ['skill.md', 'skill-claw.md', 'skill-droid.md', 'skill-opencode.md', 'skill-trae.md', 'skill-windows.md']) {
  const path = new URL(name, skills);
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf(begin), stop = text.indexOf(end);
  if ((start < 0) !== (stop < 0) || start >= 0 && stop < start) throw new Error(`${name}: invalid portable markers`);
  const updated = start < 0
    ? `${text.trimEnd()}\n\n${block}\n`
    : text.slice(0, start) + block + text.slice(stop + end.length);
  if (updated === text) continue;
  stale = true;
  if (check) console.error(`${fileURLToPath(path)}: portable block needs synchronization`);
  else writeFileSync(path, updated);
}
if (check && stale) process.exitCode = 1;
