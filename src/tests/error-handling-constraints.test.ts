import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')

const FILES_WITH_RAW_THROWS = [
  'src/core/scaffolder/github-corpus.ts',
  'src/core/model-hub/failover-model-adapter.ts',
  'src/core/config/command-surface.ts',
  'src/core/compose/agf-runner.ts',
  'src/core/algorithms/stochastic.ts',
  'src/core/mcp/mcp-client.ts',
  'src/core/scan/repo-scanner.ts',
  'src/core/tool-compress/custom-filters.ts',
  'src/core/app-server/client.ts',
  'src/core/spec-templates/agent-format.ts',
  'src/tui/cdp-browser-port.ts',
  'src/plugins/browser/cdp-connection.ts',
  'src/mcp/server.ts',
]

describe('Error handling: core modules use typed errors, not raw Error', () => {
  for (const file of FILES_WITH_RAW_THROWS) {
    it(`${file} has no raw throw new Error(`, () => {
      const content = readFileSync(join(ROOT, file), 'utf-8')
      const rawThrows = content.match(/throw new Error\(/g)
      expect(rawThrows, `${file} must use typed errors (McpGraphError/ValidationError), not raw Error`).toBeNull()
    })
  }
})
