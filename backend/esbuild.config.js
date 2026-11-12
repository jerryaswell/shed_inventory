/**
 * Bundle the handler to one ESM file for the Lambda runtime. Dependencies are
 * bundled in rather than taken from the runtime's copy, so deployed behaviour
 * cannot drift when AWS updates the base image.
 *
 * `target` names the major of the function's `runtime` in
 * modules/aws/lambda/main.tf, and the two move together in one change.
 * esbuild.config.test.js holds them to one value.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/handler.js'],
  outfile: 'dist/handler.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  // Minified, with an inline map of positions only: the function runs with
  // NODE_OPTIONS=--enable-source-maps, so a stack frame names a src/ line.
  minify: true,
  sourcemap: 'inline',
  sourcesContent: false,
  legalComments: 'none',
  // esbuild's ESM output can reference CJS builtins; shim require at the top.
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" }
});

console.log('built dist/handler.mjs');
