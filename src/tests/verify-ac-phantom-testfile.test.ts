/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_2b9edaf0e59d — `agf verify-ac` não pode aprovar um teste que não existe.
 *
 * Este comando existe para o builder decidir **não implementar** algo que já
 * está pronto. É a primeira decisão do ciclo, e a mais cara de errar: um falso
 * `satisfied` faz pular trabalho real e deixa o node no backlog parecendo
 * resolvido — a mesma mentira que o gate `PHANTOM_TESTFILE` do `agf done` já
 * barra na outra ponta.
 *
 * O defeito foi encontrado ligando `testFiles` num node de backlog NÃO
 * implementado: o arquivo declarado não existia, nenhum teste rodou, e o
 * "nenhuma falha" virou aprovação. A regra que falta é a que este arquivo fixa:
 * **ausência de execução nunca é aprovação.**
 *
 * Zero dublê: store SQLite real, arquivos reais num diretório temporário.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { verifyAc } from '../core/analyzer/verify-ac.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})

/** Um projeto real com vitest resolvível — o runner precisa existir para o teste dizer algo. */
function project(): { dir: string; store: SqliteStore } {
  const dir = mkdtempSync(join(tmpdir(), 'agf-verify-ac-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'src', 'tests'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { test: 'vitest run' }, devDependencies: { vitest: '*' } }),
  )

  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('verify-ac-fixture')
  return { dir, store }
}

function taskWithTests(store: SqliteStore, id: string, testFiles: string[]): GraphNode {
  const ts = new Date().toISOString()
  const node: GraphNode = {
    id,
    type: 'task',
    title: 'Uma task que declara seu teste',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    testFiles,
  }
  store.insertNode(node)
  return node
}

describe('verifyAc — absence of execution is never approval (node_2b9edaf0e59d)', () => {
  it('a declared test file that does NOT exist is not satisfied, and the reason names the file', () => {
    const { dir, store } = project()
    taskWithTests(store, 'node_ausente', ['src/tests/nunca-escrito.test.ts'])

    const result = verifyAc(store, 'node_ausente', dir)

    expect(result.status, 'aprovou um teste que não existe').not.toBe('satisfied')
    // O motivo tem de nomear o arquivo: "não satisfeito" sem dizer POR QUE manda
    // o builder investigar do zero exatamente o que o comando já sabia.
    expect(result.reason).toContain('nunca-escrito.test.ts')
    store.close()
  })

  it('CONTROL: a test file that exists and passes IS satisfied — the guard cannot just refuse everything', () => {
    // Sem este caso, trocar a implementação por `return not_satisfied` passaria
    // no teste acima enquanto destruía a razão de existir do comando.
    const { dir, store } = project()
    writeFileSync(
      join(dir, 'src', 'tests', 'existe.test.ts'),
      `import { it, expect } from 'vitest'\nit('passa', () => { expect(1).toBe(1) })\n`,
    )
    taskWithTests(store, 'node_existe', ['src/tests/existe.test.ts'])

    const result = verifyAc(store, 'node_existe', dir, 'node -e "process.exit(0)"')

    expect(result.status).toBe('satisfied')
    store.close()
  })

  it('a declared test that FAILS is not satisfied', () => {
    const { dir, store } = project()
    writeFileSync(
      join(dir, 'src', 'tests', 'falha.test.ts'),
      `import { it } from 'vitest'\nit('falha', () => { throw new Error('x') })\n`,
    )
    taskWithTests(store, 'node_falha', ['src/tests/falha.test.ts'])

    const result = verifyAc(store, 'node_falha', dir, 'node -e "process.exit(1)"')

    expect(result.status).toBe('not_satisfied')
    store.close()
  })

  it('one existing file among missing ones is still not enough — every declared test must be real', () => {
    // Aprovar por maioria seria a versão sutil do mesmo furo: metade da prova
    // declarada não existe, e o veredito não pode ignorar isso.
    const { dir, store } = project()
    writeFileSync(
      join(dir, 'src', 'tests', 'metade.test.ts'),
      `import { it, expect } from 'vitest'\nit('passa', () => { expect(1).toBe(1) })\n`,
    )
    taskWithTests(store, 'node_metade', ['src/tests/metade.test.ts', 'src/tests/a-outra-metade.test.ts'])

    const result = verifyAc(store, 'node_metade', dir, 'node -e "process.exit(0)"')

    expect(result.status).not.toBe('satisfied')
    expect(result.reason).toContain('a-outra-metade.test.ts')
    store.close()
  })
})

describe('verifyAc — a hung test is not an approval (mitigação do risco node_e26662a07e78)', () => {
  it('a test command that exceeds the wall-clock ceiling is not satisfied', () => {
    // O caminho do checkHint já era capado em 10s; o caminho do teste rodava
    // spawnSync SEM teto, então um runner travado penduraria o comando que
    // ABRE o ciclo do builder. Estourar o teto tem de virar "não rodou" — nunca
    // aprovação por cansaço.
    const { dir, store } = project()
    writeFileSync(
      join(dir, 'src', 'tests', 'trava.test.ts'),
      `import { it, expect } from 'vitest'\nit('passa', () => { expect(1).toBe(1) })\n`,
    )
    taskWithTests(store, 'node_trava', ['src/tests/trava.test.ts'])

    // Um comando que dorme muito mais que o teto injetado.
    const result = verifyAc(store, 'node_trava', dir, 'node -e "setTimeout(()=>{},60000)"', { timeoutMs: 800 })

    expect(result.status).not.toBe('satisfied')
    expect(result.reason).toMatch(/timeout|tempo|ran/i)
    store.close()
  })
})
