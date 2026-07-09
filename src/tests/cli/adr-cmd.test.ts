/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { adrCommand } from '../../cli/commands/adr-cmd.js'

describe('adr-cmd — conecta core/knowledge/adr-store', () => {
  let dir: string
  let out: string[]
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-adr-'))
    out = []
    spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      out.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    spy.mockRestore()
    rmSync(dir, { recursive: true, force: true })
  })

  it('create grava um ADR markdown numerado no disco', async () => {
    await adrCommand().parseAsync(
      ['create', 'Usar SQLite', '--decision', 'SQLite local', '--consequences', 'Sem infra', '--dir', dir],
      { from: 'user' },
    )
    const adrDir = join(dir, 'docs', 'adr')
    expect(existsSync(adrDir)).toBe(true)
    const files = readdirSync(adrDir).filter((f) => f.endsWith('.md'))
    expect(files.length).toBe(1)
    expect(files[0]).toContain('adr-0001')

    const json = JSON.parse(out.join(''))
    expect(json.ok).toBe(true)
    expect(json.data.title).toBe('Usar SQLite')
  })

  it('list mostra os ADRs criados', async () => {
    await adrCommand().parseAsync(['create', 'Decisão A', '--decision', 'A', '--consequences', 'C', '--dir', dir], {
      from: 'user',
    })
    out.length = 0
    await adrCommand().parseAsync(['list', '--dir', dir], { from: 'user' })
    const json = JSON.parse(out.join(''))
    expect(json.ok).toBe(true)
    expect(json.data.adrs).toHaveLength(1)
    expect(json.data.adrs[0].title).toBe('Decisão A')
  })
})
