/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_55da27d96539 — scope_creep detector + BLAST_RADIUS_EXCEEDED gate.
 * "done com escopo vazado" was only avoided because the agent remembered to
 * check. detectScopeCreep is the pure leg (modifiedFiles \ (declared ∪
 * allowlist)) — mirrors detect-phantom-done.ts's shape (missingFiles).
 */

import { describe, it, expect } from 'vitest'
import {
  detectScopeCreep,
  collectForeignInFlightFiles,
  DEFAULT_SCOPE_ALLOWLIST,
} from '../core/gaps/detect-scope-creep.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('detectScopeCreep', () => {
  it('flags a modified file not in declared or the allowlist', () => {
    const undeclared = detectScopeCreep(['src/a.ts', 'src/b.ts'], ['src/a.ts'])
    expect(undeclared).toEqual(['src/b.ts'])
  })

  it('passes when every modified file is declared (no regression vs current behavior)', () => {
    const undeclared = detectScopeCreep(['src/a.ts'], ['src/a.ts'])
    expect(undeclared).toEqual([])
  })

  it('does not flag an allowlisted file (e.g. dist/x.js)', () => {
    const undeclared = detectScopeCreep(['src/a.ts', 'dist/x.js'], ['src/a.ts'])
    expect(undeclared).toEqual([])
  })

  it('does not flag a package-lock.json change', () => {
    const undeclared = detectScopeCreep(['src/a.ts', 'package-lock.json'], ['src/a.ts'])
    expect(undeclared).toEqual([])
  })

  it('DEFAULT_SCOPE_ALLOWLIST includes the declarative whitelist plus dist/build/lock patterns', () => {
    expect(DEFAULT_SCOPE_ALLOWLIST).toEqual(
      expect.arrayContaining(['**/*.d.ts', '**/index.ts', 'dist/**', 'build/**', '**/*.lock', 'package-lock.json']),
    )
  })
})

// node_58932e8189fc — num tree compartilhado, os arquivos declarados das OUTRAS
// tasks in_progress são fronteira alheia reconhecida, não scope creep meu.
// Arquivo órfão (sem dono declarado) continua sendo acusado — o gate não afrouxa.
describe('collectForeignInFlightFiles + gate multi-formiga', () => {
  function node(id: string, status: string, implementationFiles?: string[], testFiles?: string[]): GraphNode {
    return {
      id,
      type: 'task',
      title: `Task ${id}`,
      status,
      priority: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      ...(implementationFiles ? { implementationFiles } : {}),
      ...(testFiles ? { testFiles } : {}),
    } as GraphNode
  }

  it('AC1: arquivo sujo declarado por OUTRA task in_progress não é scope creep do meu done', () => {
    const nodes = [node('minha', 'in_progress', ['src/meu.ts']), node('alheia', 'in_progress', ['src/a.ts'])]
    const foreign = collectForeignInFlightFiles(nodes, 'minha')
    const undeclared = detectScopeCreep(
      ['src/meu.ts', 'src/a.ts'],
      ['src/meu.ts'],
      [...DEFAULT_SCOPE_ALLOWLIST, ...foreign],
    )
    expect(undeclared).toEqual([])
  })

  it('AC2: arquivo sujo órfão (sem dono em nenhuma in_progress) continua acusado nominalmente', () => {
    const nodes = [node('minha', 'in_progress', ['src/meu.ts']), node('alheia', 'in_progress', ['src/a.ts'])]
    const foreign = collectForeignInFlightFiles(nodes, 'minha')
    const undeclared = detectScopeCreep(
      ['src/meu.ts', 'src/orfao.ts'],
      ['src/meu.ts'],
      [...DEFAULT_SCOPE_ALLOWLIST, ...foreign],
    )
    expect(undeclared).toEqual(['src/orfao.ts'])
  })

  it('AC3: sem nenhuma outra in_progress, a coleta é vazia (comportamento single-agent byte-idêntico)', () => {
    const nodes = [node('minha', 'in_progress', ['src/meu.ts']), node('feita', 'done', ['src/x.ts'])]
    expect(collectForeignInFlightFiles(nodes, 'minha')).toEqual([])
  })

  it('a própria task sendo fechada nunca entra na coleta (seus arquivos são o declared, não allowlist)', () => {
    const nodes = [node('minha', 'in_progress', ['src/meu.ts'])]
    expect(collectForeignInFlightFiles(nodes, 'minha')).toEqual([])
  })

  it('testFiles alheios também são fronteira (união via declaredFilesOf)', () => {
    const nodes = [node('alheia', 'in_progress', undefined, ['src/tests/a.test.ts'])]
    expect(collectForeignInFlightFiles(nodes, 'minha')).toEqual(['src/tests/a.test.ts'])
  })
})
