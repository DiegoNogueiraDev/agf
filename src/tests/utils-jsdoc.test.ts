/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_fec6afb9cace — JSDoc coverage for changelog, trace-store, git-context, atomic-json-write
 * AC: GIVEN utils files WHEN exported symbols read THEN all have JSDoc
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

describe('core/utils/changelog.ts — JSDoc coverage', () => {
  const src = read('core/utils/changelog.ts')

  it('parseConventionalCommit has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function parseConventionalCommit')).toBe(true)
  })

  it('groupByType has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function groupByType')).toBe(true)
  })

  it('formatKeepAChangelog has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function formatKeepAChangelog')).toBe(true)
  })
})

describe('core/utils/trace-store.ts — JSDoc coverage', () => {
  const src = read('core/utils/trace-store.ts')

  it('getTraceContext has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function getTraceContext')).toBe(true)
  })

  it('runWithTrace has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function runWithTrace')).toBe(true)
  })
})

describe('core/utils/git-context.ts — JSDoc coverage', () => {
  const src = read('core/utils/git-context.ts')

  it('collectGitContext has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function collectGitContext')).toBe(true)
  })

  it('formatGitContextXml has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function formatGitContextXml')).toBe(true)
  })
})

describe('core/utils/atomic-json-write.ts — JSDoc coverage', () => {
  const src = read('core/utils/atomic-json-write.ts')

  it('atomicJsonWrite has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export async function atomicJsonWrite')).toBe(true)
  })
})
