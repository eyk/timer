import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const metadata = await new Promise((resolve, reject) => execFile(process.execPath,
  [path.join(root, 'scripts/native.mjs'), 'metadata', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc'],
  { cwd: root, shell: false, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
  (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(JSON.parse(stdout))));
const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
const included = new Set();
function visit(id) {
  if (included.has(id)) return;
  included.add(id);
  for (const dependency of nodes.get(id)?.deps ?? []) visit(dependency.pkg);
}
visit(metadata.resolve.root);
const packages = metadata.packages.filter(pkg => pkg.source && included.has(pkg.id))
  .map(pkg => ({ name: `${pkg.name} ${pkg.version}`, license: pkg.license, directory: path.dirname(pkg.manifest_path) }));
for (const name of ['react', 'react-dom', 'scheduler', '@tauri-apps/api']) {
  const directory = path.join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  packages.push({ name: `${name} ${pkg.version}`, license: pkg.license, directory });
}
const sections = ['# Third-party notices\n\nGenerated from the locked Windows dependency graph and bundled frontend dependencies. Includes native build dependencies where present.\n'];
const missing = [];
const upstreamLicenses = new Map([
  ['alloc-stdlib 0.3.0', 'alloc-stdlib-0.3.0.txt'],
  ['selectors 0.38.0', 'MPL-2.0.txt'],
  ['tauri-plugin 2.7.2', 'tauri-plugin-2.7.2.txt'],
  ['webview2-com 0.39.1', 'webview2-rs.txt'],
  ['webview2-com-macros 0.8.1', 'webview2-rs.txt'],
  ['webview2-com-sys 0.39.1', 'webview2-rs.txt'],
]);
for (const pkg of packages.sort((a, b) => a.name.localeCompare(b.name))) {
  const files = (await readdir(pkg.directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^(licen[cs]e|copying|notice)([._-]|$)/i.test(entry.name))
    .map(entry => entry.name).sort();
  if (!files.length) {
    const upstream = upstreamLicenses.get(pkg.name);
    if (!upstream) { missing.push(pkg); continue; }
    sections.push(`\n## ${pkg.name}\nLicense: ${pkg.license}\n\n${await readFile(path.join(root, 'store/licenses', upstream), 'utf8')}\n`);
    continue;
  }
  sections.push(`\n## ${pkg.name}\nLicense: ${pkg.license ?? 'See included license text'}\n`);
  for (const file of files) sections.push(`\n### ${file}\n\n${await readFile(path.join(pkg.directory, file), 'utf8')}\n`);
}
if (missing.length) throw new Error(`Missing license files: ${JSON.stringify(missing)}`);
await mkdir(path.join(root, 'store'), { recursive: true });
await writeFile(path.join(root, 'store/THIRD-PARTY-NOTICES.txt'), sections.join(''));
console.error(`Collected third-party notices for ${packages.length} dependencies.`);
