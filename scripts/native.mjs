import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localEnv = path.join(root, '.env.local');
if (existsSync(localEnv)) loadEnvFile(localEnv);
const env = { ...process.env };
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = `${path.dirname(process.execPath)}${path.delimiter}${env[pathKey] ?? ''}`;
const localCargo = path.join(root, '.tooling', 'cargo');
const cargoName = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
const localExecutable = path.join(localCargo, 'bin', cargoName);
if (existsSync(localExecutable)) {
  env.CARGO_HOME = localCargo;
  env.RUSTUP_HOME = path.join(root, '.tooling', 'rustup');
  env[pathKey] = `${path.join(localCargo, 'bin')}${path.delimiter}${env[pathKey]}`;
}
const args = process.argv.slice(2);
if (['build', 'dev', 'test'].includes(args[0])) await import('./third-party-notices.mjs');
if (args.some((arg) => arg.endsWith('tauri.e2e.conf.json'))) {
  env.CARGO_TARGET_DIR = path.join(root, 'src-tauri', 'target', 'e2e');
}
const cargo = ['test', 'metadata'].includes(args[0]);
const command = cargo ? (existsSync(localExecutable) ? localExecutable : cargoName) : process.execPath;
const childArgs = cargo
  ? [args[0], '--manifest-path', 'src-tauri/Cargo.toml', '--locked', ...args.slice(1)]
  : [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), ...args];
const child = spawn(command, childArgs, { cwd: root, env, stdio: 'inherit', shell: false, windowsHide: true });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
