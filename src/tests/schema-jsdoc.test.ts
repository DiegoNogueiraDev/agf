/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_d6fcde8dd922 — Add JSDoc to schema files (agent-role agent-registry) — context 85→87
 * AC: GIVEN schema files WHEN exported symbols are read
 *     THEN each public API has a JSDoc comment preceding it
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCHEMAS_DIR = path.join(ROOT, 'src/schemas')

function readSchema(name: string): string {
  return readFileSync(path.join(SCHEMAS_DIR, name), 'utf-8')
}

function hasJsDocBefore(src: string, symbol: string): boolean {
  const idx = src.indexOf(symbol)
  if (idx === -1) return false
  const before = src.slice(Math.max(0, idx - 400), idx)
  return /\/\*\*[\s\S]*?\*\/\s*$/.test(before.trimEnd())
}

describe('agent-role.schema.ts — JSDoc coverage', () => {
  const src = readSchema('agent-role.schema.ts')

  it('AgentRoleSchema has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export const AgentRoleSchema')).toBe(true)
  })

  it('parseAgentRoleConfig has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function parseAgentRoleConfig')).toBe(true)
  })

  it('getRoleConfig has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export function getRoleConfig')).toBe(true)
  })
})

describe('agent-registry.schema.ts — JSDoc coverage', () => {
  const src = readSchema('agent-registry.schema.ts')

  it('AgentRoleRegistry has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export class AgentRoleRegistry')).toBe(true)
  })

  it('AgentRegistryOptions has JSDoc', () => {
    expect(hasJsDocBefore(src, 'export interface AgentRegistryOptions')).toBe(true)
  })
})
