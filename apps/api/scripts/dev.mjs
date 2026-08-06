import { spawn } from 'node:child_process';

// ponytail: tsx's require-hook breaks sharp's native dlopen on Windows+pnpm.
// Preloading sharp via NODE_OPTIONS (before tsx installs its hook) fixes it.
// Spawned from Node so the env var works the same under cmd.exe, PowerShell, and bash.
const childEnv = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ./scripts/preload-sharp.cjs`.trim(),
};

// The API's real config lives in .env (loaded via --env-file below), and Node's
// --env-file deliberately does NOT override variables already present in the
// environment. A stale WEB_URL inherited from the parent shell/IDE (a Railway
// preview subdomain leaked into the session at some point) would therefore
// silently win over .env and leak into collection share links + CORS. Drop the
// inherited copy so .env is the single source of truth for dev boots.
delete childEnv.WEB_URL;

const child = spawn('npx', ['tsx', 'watch', '--env-file', '.env', 'src/index.ts'], {
  stdio: 'inherit',
  shell: true,
  env: childEnv,
});

child.on('exit', (code) => process.exit(code ?? 0));
