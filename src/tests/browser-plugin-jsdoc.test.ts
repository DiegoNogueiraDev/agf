/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_cd5695df6629 — Add JSDoc to browser plugin files — context 83→85
 * AC: GIVEN browser plugin files WHEN exported symbols are read
 *     THEN each public API has a JSDoc comment preceding it
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BROWSER_DIR = path.join(ROOT, 'src/plugins/browser')

function readPlugin(rel: string): string {
  return readFileSync(path.join(BROWSER_DIR, rel), 'utf-8')
}

function hasJsDocBefore(src: string, symbol: string): boolean {
  const idx = src.indexOf(symbol)
  if (idx === -1) return false
  const before = src.slice(Math.max(0, idx - 300), idx)
  return /\/\*\*[\s\S]*?\*\/\s*$/.test(before.trimEnd())
}

describe('discovery.ts — JSDoc coverage', () => {
  const src = readPlugin('discovery.ts')

  it('discoverCdpUrl has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function discoverCdpUrl')).toBe(true)
  })

  it('CdpDiscoveryOptions has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export interface CdpDiscoveryOptions')).toBe(true)
  })
})

describe('plugin.ts — JSDoc coverage', () => {
  const src = readPlugin('plugin.ts')

  it('registerBrowserTools has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function registerBrowserTools')).toBe(true)
  })

  it('ToolHandler has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export interface ToolHandler')).toBe(true)
  })
})

describe('actions/index.ts — JSDoc coverage', () => {
  const src = readPlugin('actions/index.ts')

  it('BrowserActions has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export interface BrowserActions')).toBe(true)
  })

  it('createBrowserActions has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function createBrowserActions')).toBe(true)
  })
})
