import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['--test', 'tests/phase0-integration.test.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
