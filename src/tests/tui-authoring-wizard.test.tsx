/*!
 * TDD: authoring wizard TUI — skill + hook creation (node_828849b8248c).
 *
 * AC1: wizard 'skill new <name>' → calls scaffoldSkill → file created.
 * AC2: wizard 'hook add' → calls addHookEntry → hook in config.
 * AC3: wizard 'cancel' → nothing written.
 *
 * Tests use mock SkillExecutionContext so no DB/fs outside tmpDir.
 */

import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AuthoringWizardHandler } from '../tui/authoring-wizard-handler.js'
import type { SkillExecutionContext } from '../tui/skill-handler-port.js'

function makeMockCtx(dir: string): SkillExecutionContext {
  return {
    dir,
    store: {} as SkillExecutionContext['store'],
    testCmd: '',
    ledger: { record: vi.fn() } as unknown as SkillExecutionContext['ledger'],
    onProgress: vi.fn(),
  }
}

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'agf-wizard-'))
}

describe('AuthoringWizardHandler — AC1: skill new', () => {
  it('AC1: "skill new my-skill" creates skill file in .agents/skills/', async () => {
    const dir = makeTmp()
    try {
      const handler = new AuthoringWizardHandler()
      const ctx = makeMockCtx(dir)
      const result = await handler.execute('skill new my-skill', ctx)
      expect(result).toContain('my-skill')
      const skillPath = join(dir, '.agents', 'skills', 'my-skill', 'SKILL.md')
      expect(existsSync(skillPath)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('AC1: result summary mentions skill name', async () => {
    const dir = makeTmp()
    try {
      const handler = new AuthoringWizardHandler()
      const ctx = makeMockCtx(dir)
      const result = await handler.execute('skill new test-skill', ctx)
      expect(result).toContain('test-skill')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('AuthoringWizardHandler — AC2: hook add', () => {
  it('AC2: "hook add --channel tool:pre-call --cmd agf check" writes hook entry', async () => {
    const dir = makeTmp()
    try {
      const handler = new AuthoringWizardHandler()
      const ctx = makeMockCtx(dir)
      const result = await handler.execute('hook add --channel tool:pre-call --cmd "agf check"', ctx)
      expect(result).toContain('tool:pre-call')
      const hooksPath = join(dir, '.mcp-graph', 'hooks.json')
      expect(existsSync(hooksPath)).toBe(true)
      const cfg = JSON.parse(readFileSync(hooksPath, 'utf-8')) as { version: number; hooks: Record<string, unknown> }
      expect(cfg.version).toBe(1)
      expect(cfg.hooks).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('AuthoringWizardHandler — AC3: cancel', () => {
  it('AC3: "cancel" returns cancelled message and writes nothing', async () => {
    const dir = makeTmp()
    try {
      const handler = new AuthoringWizardHandler()
      const ctx = makeMockCtx(dir)
      const result = await handler.execute('cancel', ctx)
      expect(result.toLowerCase()).toContain('cancel')
      expect(existsSync(join(dir, '.agents'))).toBe(false)
      expect(existsSync(join(dir, '.mcp-graph'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('AuthoringWizardHandler — unknown command', () => {
  it('returns usage hint on unknown command', async () => {
    const dir = makeTmp()
    try {
      const handler = new AuthoringWizardHandler()
      const ctx = makeMockCtx(dir)
      const result = await handler.execute('unknown xyz', ctx)
      expect(result).toContain('skill new')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
