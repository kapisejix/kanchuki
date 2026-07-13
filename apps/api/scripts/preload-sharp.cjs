// ponytail: tsx's require-hook breaks sharp's native dlopen on Windows+pnpm.
// Loading sharp here (before tsx installs its hook) primes the module cache
// so the later `import sharp` in app code hits cache instead of dlopen again.
require('sharp');
