import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { boundaryViolations } from './boundary-rules.mjs';

const root = resolve(import.meta.dirname, '..');
async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path)); else if (entry.name.endsWith('.ts')) output.push(path);
  }
  return output;
}
const errors = [];
for (const path of await files(join(root, 'src'))) {
  const name = relative(join(root, 'src'), path).replaceAll('\\', '/');
  errors.push(...boundaryViolations(name, await readFile(path, 'utf8')).map((error) => `${name}: ${error}`));
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('SOLID boundaries and no explicit any verified.');
