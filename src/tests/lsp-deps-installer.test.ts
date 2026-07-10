/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_8e1f503040d9 — C76-T1: tests for LSP_NPM_PACKAGES + LSP_SYSTEM_PACKAGES
 *
 * AC: LSP_NPM_PACKAGES is a non-empty Record with string values;
 *     LSP_SYSTEM_PACKAGES entries have command and installHint;
 *     blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { LSP_NPM_PACKAGES, LSP_SYSTEM_PACKAGES } from '../core/lsp/lsp-deps-installer.js'

describe('LSP_NPM_PACKAGES', () => {
  it('is a non-empty object', () => {
    expect(typeof LSP_NPM_PACKAGES).toBe('object')
    expect(Object.keys(LSP_NPM_PACKAGES).length).toBeGreaterThan(0)
  })

  it('all values are non-empty strings', () => {
    for (const [, pkg] of Object.entries(LSP_NPM_PACKAGES)) {
      expect(typeof pkg).toBe('string')
      expect(pkg.length).toBeGreaterThan(0)
    }
  })

  it('includes typescript language server', () => {
    expect(LSP_NPM_PACKAGES).toHaveProperty('typescript')
    expect(typeof LSP_NPM_PACKAGES['typescript']).toBe('string')
  })

  it('all keys are lowercase language identifiers', () => {
    for (const key of Object.keys(LSP_NPM_PACKAGES)) {
      expect(key).toBe(key.toLowerCase())
    }
  })
})

describe('LSP_SYSTEM_PACKAGES', () => {
  it('is a non-empty object', () => {
    expect(typeof LSP_SYSTEM_PACKAGES).toBe('object')
    expect(Object.keys(LSP_SYSTEM_PACKAGES).length).toBeGreaterThan(0)
  })

  it('every entry has a command string', () => {
    for (const [lang, entry] of Object.entries(LSP_SYSTEM_PACKAGES)) {
      expect(typeof entry.command).toBe('string')
      expect(entry.command.length).toBeGreaterThan(0)
      void lang
    }
  })

  it('every entry has an installHint string', () => {
    for (const [lang, entry] of Object.entries(LSP_SYSTEM_PACKAGES)) {
      expect(typeof entry.installHint).toBe('string')
      expect(entry.installHint.length).toBeGreaterThan(0)
      void lang
    }
  })

  it('includes python language server', () => {
    expect(LSP_SYSTEM_PACKAGES).toHaveProperty('python')
    expect(LSP_SYSTEM_PACKAGES['python']).toHaveProperty('command')
    expect(LSP_SYSTEM_PACKAGES['python']).toHaveProperty('installHint')
  })

  it('includes rust-analyzer', () => {
    expect(LSP_SYSTEM_PACKAGES).toHaveProperty('rust')
    expect(LSP_SYSTEM_PACKAGES['rust']?.command).toBeTruthy()
  })

  it('all keys are lowercase language identifiers', () => {
    for (const key of Object.keys(LSP_SYSTEM_PACKAGES)) {
      expect(key).toBe(key.toLowerCase())
    }
  })

  it('no language appears in both npm and system packages simultaneously', () => {
    const npmLangs = new Set(Object.keys(LSP_NPM_PACKAGES))
    const systemLangs = new Set(Object.keys(LSP_SYSTEM_PACKAGES))
    const overlap = [...npmLangs].filter((l) => systemLangs.has(l))
    expect(overlap).toHaveLength(0)
  })
})
