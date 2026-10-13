import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import ts from 'typescript';

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
  const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const layer = name.split('/')[0];
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) errors.push(`${name}: explicit any`);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const dependency = node.moduleSpecifier.text;
      const allowed = layer === 'core' ? /^\.\/|^\.\.\/core\//u
        : layer === 'application' ? /^\.\/|^\.\.\/(?:core|application)\//u : null;
      if (allowed && !allowed.test(dependency)) errors.push(`${name}: outward import ${dependency}`);
    }
    if ((layer === 'core' || layer === 'application') && ts.isIdentifier(node)
      && ['chrome', 'document', 'window', 'indexedDB', 'fetch', 'HTMLElement', 'HTMLInputElement'].includes(node.text)) errors.push(`${name}: platform dependency ${node.text}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('SOLID boundaries and no explicit any verified.');
