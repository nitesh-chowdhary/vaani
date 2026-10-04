import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const built = spawnSync('npm', ['run', 'build', '-w', '@vaani/learning-core'], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

// Root launcher: run both workspaces and stop both when either process exits.
const children = ['@vaani/api', '@vaani/web'].map((workspace) =>
  spawn('npm', ['run', 'dev', '--workspace', workspace], {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
);
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH')
        console.error('Unable to stop a development process.');
    }
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
