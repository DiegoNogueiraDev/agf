/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_41e538e0b427 — o hook de pre-push cobra o que o projeto promete.
 *
 * Um requisito do projeto (node_54871e2b72b4) diz que toda mudança mantém
 * build, typecheck, test e lint verdes. Só typecheck e test tinham gatilho; os
 * outros dois dependiam de alguém lembrar — e a evidência de que isso não
 * funciona sou eu: numa sessão inteira rodei typecheck e o blast dezenas de
 * vezes por hábito, lint em poucos ciclos e build em nenhum. Regra de Ouro 8:
 * enforcement é gatilho determinístico, não boa intenção.
 *
 * Este teste é estático de propósito. O `test:blast` segue o grafo de imports
 * do Vite e é CEGO a arquivos de convenção como um hook de shell — se a
 * cobertura do gate não for asserida aqui, ninguém percebe quando ela regride.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/** Lê um arquivo do repo. Caminho montado aqui dentro — o lint cobra
 *  `readFileSync` com argumento não-literal, e a guarda existe por bons
 *  motivos (path traversal); num teste o caminho é do próprio repo. */
function readRepoFile(...parts: readonly string[]): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- caminho fixo do repo, sem entrada externa
  return readFileSync(join(process.cwd(), ...parts), 'utf-8')
}

const HOOK = readRepoFile('.husky', 'pre-push')
const PKG = JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string> }

/** Os quatro que o requisito exige verdes a cada mudança. */
const REQUIRED_GATES = ['typecheck', 'build', 'lint', 'test:blast:push']

describe('pre-push hook — every gate the project promises has a trigger', () => {
  it.each(REQUIRED_GATES)('runs %s', (gate) => {
    expect(HOOK, `.husky/pre-push não dispara ${gate}`).toContain(`run ${gate}`)
  })

  it('every gate it runs is a real script — a hook cannot call what does not exist', () => {
    // Um hook que invoca script inexistente falha na hora do push, no pior
    // momento possível: quando alguém já terminou o trabalho.
    const invoked = [...HOOK.matchAll(/^\s*(?:bun|npm) run ([\w:]+)/gm)].map((m) => m[1])
    expect(invoked.length).toBeGreaterThan(0)
    for (const script of invoked) {
      expect(PKG.scripts[script], `pre-push chama "${script}", que não existe em package.json`).toBeDefined()
    }
  })
})

describe('the lint budget is a RATCHET, not a target', () => {
  it('pins --max-warnings to a measured count, not a round number', () => {
    // O acervo tem ~2018 avisos e ZERO erros. Exigir limpeza antes de ligar o
    // gate significaria não ligar o gate; um número redondo (1000, 5000) ou
    // afrouxa a ponto de não morder, ou bloqueia todo push até alguém limpar.
    // Fixado na contagem real, o gate congela a dívida: um aviso NOVO reprova.
    const lint = PKG.scripts.lint ?? ''
    const max = Number(/--max-warnings\s+(\d+)/.exec(lint)?.[1])

    expect(Number.isFinite(max), `lint sem --max-warnings: "${lint}"`).toBe(true)
    expect(max % 100, `--max-warnings=${max} parece número redondo, não medição`).not.toBe(0)
  })

  it('the ratchet is documented where it is set — a bare number invites someone to raise it', () => {
    expect(HOOK).toMatch(/catraca|ratchet/i)
  })
})

describe('the hook is SHARED, not per-machine (node_41e538e0b427)', () => {
  it('pre-push is tracked by git — a gate only one clone has is not a gate', () => {
    // Ele nasceu fora do versionamento (nunca esteve no historico) enquanto os
    // irmaos commit-msg e pre-commit sempre estiveram. Enforcement que vale so
    // na maquina de quem o escreveu nao cobra ninguem mais.
    const tracked = execFileSync('git', ['ls-files', '.husky/pre-push'], { encoding: 'utf-8' }).trim()
    expect(tracked, '.husky/pre-push nao esta versionado').toBe('.husky/pre-push')
  })

  it('invokes npm, not bun — the runner must exist on a fresh clone', () => {
    // O irmao versionado usa npm; exigir bun aqui quebraria o push de quem nao
    // o tem, e a medicao mostrou o mesmo custo (19s) nos dois.
    expect(HOOK).not.toMatch(/\bbun run\b/)
    expect(HOOK).toMatch(/\bnpm run\b/)
  })
})
