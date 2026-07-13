import { spawn } from 'node:child_process';

// ponytail: tsx's require-hook breaks sharp's native dlopen on Windows+pnpm.
// Preloading sharp via NODE_OPTIONS (before tsx installs its hook) fixes it.
// Spawned from Node so the env var works the same under cmd.exe, PowerShell, and bash.
const child = spawn('npx', ['tsx', 'watch', '--env-file', '.env', 'src/index.ts'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ./scripts/preload-sharp.cjs`.trim(),
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
