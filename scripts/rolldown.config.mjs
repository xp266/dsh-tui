import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(here, '..')
const require = createRequire(join(projectRoot, 'package.json'))

export default {
  input: process.env.SNAPSHOT_ENTRY ?? join(here, 'src', 'main.tsx'),
  resolve: {
    alias: {
      'react-devtools-core': join(here, 'stub.mjs'),
      chalk: require.resolve('chalk'),
    },
  },
  output: {
    file: process.env.SNAPSHOT_OUT ?? join(here, 'dist', 'cli.mjs'),
    format: 'esm',
    codeSplitting: false,
  },
  platform: 'node',
  tsconfig: join(projectRoot, 'tsconfig.json'),
}
