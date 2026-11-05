import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const json = async (file) => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
const pkg = await json('../package.json');
const config = await json('../src-tauri/tauri.conf.json');
const npmLock = await json('../package-lock.json');
const cargo = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const cargoLock = await readFile(new URL('../src-tauri/Cargo.lock', import.meta.url), 'utf8');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.equal(config.version, pkg.version);
assert.equal(npmLock.version, pkg.version);
assert.equal(npmLock.packages[''].version, pkg.version);
assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], pkg.version);
assert.equal(cargoLock.match(/name = "timer"\r?\nversion = "([^"]+)"/)?.[1], pkg.version);
assert.equal(config.app.windows[0].maximizable, false);
assert.equal(config.app.windows[0].visible, false);
const listing = await json('../store/listing.de-DE.json');
assert.equal(config.productName, 'Eyk Timer');
assert.equal(config.app.windows[0].title, 'Timer');
assert.equal(config.app.windows[0].theme, null);
assert.ok(listing.description.length > 0 && listing.description.length <= 10000);
async function png(file, width, height, exact = true) {
  const data = await readFile(new URL(file, import.meta.url));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  assert.ok(data.length < 50 * 1024 * 1024);
  if (exact) {
    assert.equal(data.readUInt32BE(16), width);
    assert.equal(data.readUInt32BE(20), height);
  } else {
    assert.ok(data.readUInt32BE(16) >= width && data.readUInt32BE(20) >= height);
  }
}
for (const languageListing of [listing, await json('../store/listing.en-US.json')]) {
assert.equal(languageListing.title, 'Eyk Timer');
for (const screenshot of languageListing.screenshots) {
  assert.ok(screenshot.caption.length <= 200);
  await png(`../store/${screenshot.file}`, 1366, 768, false);
}
}
await png('../store/assets/Square44x44Logo.png', 44, 44);
await png('../store/assets/Square150x150Logo.png', 150, 150);
await png('../store/assets/StoreLogo.png', 50, 50);
await png('../store/assets/300x300.png', 300, 300);
console.log(`Release metadata consistent: ${pkg.version}`);
