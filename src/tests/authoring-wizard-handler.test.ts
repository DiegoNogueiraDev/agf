/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthoringWizardHandler } from '../tui/authoring-wizard-handler.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import type { SkillExecutionContext } from '../tui/skill-handler-port.js'

describe('AuthoringWizardHandler', () => {
  let dir: string
  let ctx: SkillExecutionContext
  let store: SqliteStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-authoring-wizard-'))
    store = SqliteStore.open(':memory:')
    ctx = {
      store,
      dir,
      testCmd: '',
      ledger: new TokenLedger(),
      onProgress: () => {},
    }
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('cancel: reports cancellation without writing anything', async () => {
    const handler = new AuthoringWizardHandler()
    const result = await handler.execute('cancel', ctx)
    expect(result).toContain('Cancelled')
  })

  it('empty/unknown input returns the usage text', async () => {
    const handler = new AuthoringWizardHandler()
    const result = await handler.execute('', ctx)
    expect(result).toContain('Usage:')
  })

  it('skill new <name>: requires a name', async () => {
    const handler = new AuthoringWizardHandler()
    const result = await handler.execute('skill new', ctx)
    expect(result).toContain('Missing skill name')
  })

  it('skill new <name>: scaffolds a real skill directory', async () => {
    const handler = new AuthoringWizardHandler()
    const result = await handler.execute('skill new my-test-skill', ctx)
    expect(result).toContain('created')
    expect(existsSync(join(dir, '.agents', 'skills', 'my-test-skill'))).toBe(true)
  })

  it('hook add: requires --channel and --cmd', async () => {
    const handler = new AuthoringWizardHandler()
    expect(await handler.execute('hook add --cmd echo', ctx)).toContain('Missing --channel')
    expect(await handler.execute('hook add --channel tool:pre-call', ctx)).toContain('Missing --cmd')
  })

  it('hook add: parses quoted --cmd values with spaces', async () => {
    const handler = new AuthoringWizardHandler()
    const result = await handler.execute('hook add --channel tool:pre-call --cmd "echo hello world"', ctx)
    expect(result).toContain('Hook added')
  })
})
