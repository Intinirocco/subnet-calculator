import esbuild from 'esbuild';
import builtInModules from 'builtin-modules';

const context = await esbuild.context({
  entryPoints: ['test/test.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtInModules],
  format: 'cjs',
  target: 'ES6',
  logLevel: 'info',
  sourcemap: 'inline',
  treeShaking: true,
  outfile: 'test/test.js',
});

await context.rebuild();
context.dispose();
