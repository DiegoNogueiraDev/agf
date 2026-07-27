/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Guards the public SCANINFO contract doc for the landing: the example fixture must
 * stay schema-valid, and the badge-rendering rules must cover every verdict.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { scanInfoSchema } from '../schemas/scan-info.js'

const DOC = join(process.cwd(), 'docs', 'contracts', 'scaninfo.md')

describe('SCANINFO contract doc (landing badge)', () => {
  it('exists', () => {
    expect(existsSync(DOC)).toBe(true)
  })

  it('documents a badge rule for every verdict (clean/flagged/unknown)', () => {
    const md = readFileSync(DOC, 'utf8')
    for (const verdict of ['clean', 'flagged', 'unknown']) {
      expect(md).toContain(verdict)
    }
  })

  it('embeds an example SCANINFO fixture that validates against the schema', () => {
    const md = readFileSync(DOC, 'utf8')
    const block = md.match(/```json\s*([\s\S]*?)```/)
    expect(block, 'doc must contain a ```json fixture').not.toBeNull()
    const fixture = JSON.parse(block![1])
    expect(() => scanInfoSchema.parse(fixture)).not.toThrow()
  })

  it('points at the public URL the landing fetches', () => {
    expect(readFileSync(DOC, 'utf8')).toContain('graph-flow.cloud/releases/SCANINFO.json')
  })
})
