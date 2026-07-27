/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_61b89dcf61f8 — Add JSDoc to tui/scaffold.ts and core/web/progress-html.ts — context 87→89
 * AC: GIVEN the two files WHEN exported functions are read
 *     THEN each has a JSDoc comment directly preceding it
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function readSrc(rel: string): string {
  return readFileSync(path.join(ROOT, 'src', rel), 'utf-8')
}

function hasJsDocBefore(src: string, symbol: string): boolean {
  const idx = src.indexOf(symbol)
  if (idx === -1) return false
  const before = src.slice(Math.max(0, idx - 300), idx)
  return /\/\*\*[\s\S]*?\*\/\s*$/.test(before.trimEnd())
}

describe('tui/scaffold.ts — JSDoc coverage', () => {
  const src = readSrc('tui/scaffold.ts')

  it('scaffoldFile has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function scaffoldFile')).toBe(true)
  })

  it('scaffoldFromContract has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function scaffoldFromContract')).toBe(true)
  })
})

describe('core/web/progress-html.ts — JSDoc coverage', () => {
  const src = readSrc('core/web/progress-html.ts')

  it('renderProgressHtml has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function renderProgressHtml')).toBe(true)
  })
})
