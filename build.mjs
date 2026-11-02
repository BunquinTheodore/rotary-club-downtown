// Production build for Vercel: bundles and minifies the ESM app into dist/ with hashed names.
// Local development keeps running the unbuilt sources (python -m http.server), so nothing here
// is required to work on the site. Usage: npm run build
import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const JS_OUT = path.join(DIST, 'js');
const CSS_FILES = ['css/style.css', 'css/motion.css'];
const HASH_LEN = 8;
// Must match the PREFETCH_3D literal in js/main.js after minification.
const PREFETCH_LITERAL = '["js/scene3d.js","js/fx/wheel3d.js","js/fx/field3d.js","js/fx/trail3d.js","js/fx/harness3d.js"]';

const hashOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, HASH_LEN).toUpperCase();
const toPosix = (p) => p.split(path.sep).join('/');
const distRel = (abs) => toPosix(path.relative(DIST, abs));

async function bundleJs() {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: { main: 'js/main.js' },
    outdir: JS_OUT,
    bundle: true,
    format: 'esm',
    splitting: true,
    minify: true,
    target: 'es2020',
    external: ['three', 'three/addons/*'],
    entryNames: '[name]',
    chunkNames: '[name]-[hash]',
    metafile: true,
    legalComments: 'none',
    logLevel: 'warning',
  });
  return result.metafile;
}

/** Output files of the lazy 3D chunk plus the chunks it imports statically. */
function find3DChunks(metafile) {
  const outputs = metafile.outputs;
  const sceneOut = Object.keys(outputs).find((out) => outputs[out].inputs['js/scene3d.js']);
  if (!sceneOut) throw new Error('build: scene3d chunk not found in metafile');
  const deps = outputs[sceneOut].imports
    .filter((imp) => imp.kind === 'import-statement' && !imp.external)
    .map((imp) => imp.path);
  return [sceneOut, ...deps].map((out) => distRel(path.join(ROOT, out)));
}

/** Chunks the entry imports statically; preloading them removes one request round trip. */
function findEntryChunks(metafile) {
  const outputs = metafile.outputs;
  const entryOut = Object.keys(outputs).find((out) => outputs[out].entryPoint === 'js/main.js');
  if (!entryOut) throw new Error('build: main entry not found in metafile');
  return outputs[entryOut].imports
    .filter((imp) => imp.kind === 'import-statement' && !imp.external)
    .map((imp) => distRel(path.join(ROOT, imp.path)));
}

/** Rewrites the 3D prefetch list, then content hashes the entry so it can be cached forever. */
async function finalizeEntry(chunks) {
  const entryPath = path.join(JS_OUT, 'main.js');
  const code = await readFile(entryPath, 'utf8');
  if (!code.includes(PREFETCH_LITERAL)) throw new Error('build: PREFETCH_3D literal not found in main.js output');
  const next = code.replace(PREFETCH_LITERAL, JSON.stringify(chunks));
  const hashedName = `main-${hashOf(next)}.js`;
  await writeFile(path.join(JS_OUT, hashedName), next);
  await rm(entryPath);
  return `js/${hashedName}`;
}

async function minifyCss() {
  const map = {};
  await mkdir(path.join(DIST, 'css'), { recursive: true });
  for (const file of CSS_FILES) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    const { code } = await transform(source, { loader: 'css', minify: true, legalComments: 'none' });
    const base = path.basename(file, '.css');
    const out = `css/${base}-${hashOf(code)}.css`;
    await writeFile(path.join(DIST, out), code);
    map[file] = out;
  }
  return map;
}

function replaceOnce(html, from, to) {
  if (!html.includes(from)) throw new Error(`build: "${from}" not found in index.html`);
  return html.split(from).join(to);
}

async function writeHtml(entry, cssMap, entryChunks) {
  let html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const preloads = entryChunks.map((href) => `<link rel="modulepreload" href="${href}">
  `).join('');
  html = replaceOnce(html, '<script type="module" src="js/main.js"></script>', `${preloads}<script type="module" src="${entry}"></script>`);
  for (const [src, out] of Object.entries(cssMap)) html = replaceOnce(html, `href="${src}"`, `href="${out}"`);
  await writeFile(path.join(DIST, 'index.html'), html);
}

async function main() {
  const started = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  const metafile = await bundleJs();
  const chunks = find3DChunks(metafile);
  const entry = await finalizeEntry(chunks);
  const cssMap = await minifyCss();
  await writeHtml(entry, cssMap, findEntryChunks(metafile));
  await cp(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), {
    recursive: true,
    filter: (src) => !/(\.DS_Store|Thumbs\.db)$/.test(src),
  });
  process.stdout.write(`build: ${entry}, ${Object.values(cssMap).join(', ')}, 3D chunks ${chunks.join(', ')} (${Date.now() - started}ms)\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
