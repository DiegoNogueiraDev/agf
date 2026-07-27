/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_6718fd8a6c56 — Add JSDoc to core/agent-driver/collaboration-mode.ts
 * AC: GIVEN collaboration-mode WHEN exported symbols read THEN key APIs have JSDoc
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function read(rel: string): string {
  return readFileSync(path.join(ROOT, 'src', rel), 'utf-8')
}

function hasJsDocBefore(src: string, symbol: string): boolean {
  const idx = src.indexOf(symbol)
  if (idx === -1) return false
  const before = src.slice(Math.max(0, idx - 400), idx)
  return /\/\*\*[\s\S]*?\*\/\s*$/.test(before.trimEnd())
}

describe('core/agent-driver/collaboration-mode.ts — JSDoc coverage', () => {
  const src = read('core/agent-driver/collaboration-mode.ts')

  it('CollaborationMode has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export type CollaborationMode')).toBe(true)
  })

  it('getCollaborationTemplate has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function getCollaborationTemplate')).toBe(true)
  })

  it('listModes has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function listModes')).toBe(true)
  })
})
