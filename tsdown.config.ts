import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.tsx', 'src/contract/index.ts', 'src/vendor.ts', 'src/dialog.ts'],
  format: ['esm'],
  target: 'node22',
  dts: true,
  clean: true,
  outDir: 'lib',
  external: [/^@deepseek-ai\//, 'prismjs'],
})
