/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_d7d60e3fa32a — JSDoc coverage for tool-compress filters batch
 * AC: GIVEN tool-compress filter exports WHEN read THEN tree, testRunner, smartTruncate,
 *     searchList, readNumbered, ls, lintReport, grep all have JSDoc
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

describe('tool-compress filter functions — JSDoc coverage', () => {
  it('tree has JSDoc', () => {
    const src = read('core/tool-compress/filters/tree.ts')
    expect(hasJsDocBefore(src, 'export function tree')).toBe(true)
  })

  it('grep has JSDoc', () => {
    const src = read('core/tool-compress/filters/grep.ts')
    expect(hasJsDocBefore(src, 'export function grep')).toBe(true)
  })

  it('ls has JSDoc', () => {
    const src = read('core/tool-compress/filters/ls.ts')
    expect(hasJsDocBefore(src, 'export function ls')).toBe(true)
  })

  it('searchList has JSDoc', () => {
    const src = read('core/tool-compress/filters/searchList.ts')
    expect(hasJsDocBefore(src, 'export function searchList')).toBe(true)
  })

  it('readNumbered has JSDoc', () => {
    const src = read('core/tool-compress/filters/readNumbered.ts')
    expect(hasJsDocBefore(src, 'export function readNumbered')).toBe(true)
  })

  it('smartTruncate has JSDoc', () => {
    const src = read('core/tool-compress/filters/smartTruncate.ts')
    expect(hasJsDocBefore(src, 'export function smartTruncate')).toBe(true)
  })

  it('lintReport has JSDoc', () => {
    const src = read('core/tool-compress/filters/lintReport.ts')
    expect(hasJsDocBefore(src, 'export function lintReport')).toBe(true)
  })

  it('testRunner has JSDoc', () => {
    const src = read('core/tool-compress/filters/testRunner.ts')
    expect(hasJsDocBefore(src, 'export function testRunner')).toBe(true)
  })

  it('formatCompressLog has JSDoc', () => {
    const src = read('core/tool-compress/index.ts')
    expect(hasJsDocBefore(src, 'export function formatCompressLog')).toBe(true)
  })

  it('safeApply has JSDoc', () => {
    const src = read('core/tool-compress/apply-filter.ts')
    expect(hasJsDocBefore(src, 'export function safeApply')).toBe(true)
  })

  it('extractAllFailures has JSDoc', () => {
    const src = read('core/tool-compress/extract-failures.ts')
    expect(hasJsDocBefore(src, 'export function extractAllFailures')).toBe(true)
  })

  it('buildStructuredSummary has JSDoc', () => {
    const src = read('core/tool-compress/extract-failures.ts')
    expect(hasJsDocBefore(src, 'export function buildStructuredSummary')).toBe(true)
  })
})
