/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_6307ad3737ec — Add JSDoc to cli/shared/delegation.ts and run-build.ts
 * AC: GIVEN cli shared files WHEN exported symbols read THEN each has JSDoc
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

describe('cli/shared/delegation.ts — JSDoc coverage', () => {
  const src = read('cli/shared/delegation.ts')

  it('DelegatedEnvelope has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export interface DelegatedEnvelope')).toBe(true)
  })

  it('detectAgfLlm has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function detectAgfLlm')).toBe(true)
  })
})

describe('cli/shared/run-build.ts — JSDoc coverage', () => {
  const src = read('cli/shared/run-build.ts')

  it('RunBuildOptions has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export interface RunBuildOptions')).toBe(true)
  })

  it('runBuildOrchestration has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export async function runBuildOrchestration')).toBe(true)
  })
})
