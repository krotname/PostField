import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const task = process.argv[2] === 'benchmark' ? 'benchmark' : 'deliver';
const output = resolve(`.cache/${task}.mjs`);
await build({ entryPoints: [`scripts/${task}.ts`], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node24' });
await import(pathToFileURL(output).href);
