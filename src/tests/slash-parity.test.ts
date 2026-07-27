/*!
 * Coverage guard: every "required" CLI command has a slash in dispatch-catalog.ts.
 * node_2229f481d22b
 *
 * "Required" = commands that are part of the loop + lifecycle surface that a TUI
 * user would need during an interactive session.
 *
 * Intentional exclusions (batch/CI-only — no TUI slash needed):
 *   eval        — batch evaluation; not interactive
 *   gc          — graph garbage-collect; maintenance-only
 *   daemon      — background process management; not interactive
 *   migrate     — DB migrations; run once at init
 *   export      — large file export; CLI-only
 *   retrieve-command — meta-search; rarely typed directly
 *   benchmark   — perf test; CI-only
 *   scan-repos  — background scan; CI-only
 *   deploy      — infra; CLI-only
 */

import { describe, it, expect } from 'vitest'
import { COMMANDS } from '../tui/dispatch-catalog.js'

const REQUIRED_SLASH_COMMANDS = [
  // Loop core
  'next',
  'check',
  'loop',
  'autopilot',
  // Graph read
  'stats',
  'context',
  'gaps',
  'kanban',
  'insights',
  'preflight',
  'savings',
  // Graph mutate
  'import-prd',
  // Delegation
  'brief',
  'submit',
  // Lifecycle phases
  'spec',
  'constitution',
  'forecast',
  'gate',
  // Multi-agent
  'swarm',
  // Ops
  'snapshot',
  'template',
  'preset',
  'plugin',
  'hooks',
  'lint-files',
  'skills',
  // Economy
  'metrics',
  'status',
  'provider',
  'model',
  'doctor',
  // Authoring
  'scaffold',
] as const

const slashNames = new Set(COMMANDS.map((c) => c.name))

describe('slash-parity: required loop+lifecycle commands have a TUI slash', () => {
  for (const cmd of REQUIRED_SLASH_COMMANDS) {
    it(`//${cmd} is in dispatch-catalog`, () => {
      expect(slashNames.has(cmd), `Missing slash for required command: /${cmd}`).toBe(true)
    })
  }
})

describe('intentional exclusions are NOT in required list', () => {
  const EXCLUDED = ['eval', 'gc', 'daemon', 'migrate', 'export', 'benchmark', 'scan-repos', 'deploy']
  it('excluded commands are documented and absent from required list', () => {
    for (const ex of EXCLUDED) {
      expect(REQUIRED_SLASH_COMMANDS).not.toContain(ex)
    }
  })
})
