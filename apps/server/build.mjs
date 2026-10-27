import { build } from 'esbuild';

// The server, with its dependencies and the shared core bundled into one file.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Some bundled CommonJS dependencies call require().
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

// The browser run simulator, which runs the same workout engine as the phone will.
await build({
  entryPoints: ['src/sim/sim.ts'],
  outfile: 'public/sim.js',
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
});
