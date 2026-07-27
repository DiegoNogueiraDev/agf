/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_a287463cb115 — `--dir` significava duas coisas em subcomandos irmãos.
 *
 * Medido num sandbox limpo: `skill new X --dir /p` criava `/p/X/SKILL.md`, e
 * `skill list --dir /p` devolvia `count: 0`. Cada comando fazia exatamente o
 * que sua própria ajuda dizia — em `new`, `--dir` era o DESTINO; em `list`, a
 * RAIZ do projeto — e a sequência óbvia produzia uma skill que não existe para
 * nenhuma superfície. Sem erro, sem aviso: criada com sucesso e invisível.
 *
 * A decisão (ADR no nó): `--dir` passa a ser a raiz nos dois, com o destino
 * resolvido pelas raízes que o `list` já varre. Destino explícito ganha
 * `--dest`, então quem precisa dele não perde nada.
 *
 * O que estes testes fixam é a REGRA, não o caminho: por isso comparam contra
 * `defaultSkillRoots` em vez de escrever `.claude/skills` à mão — se as raízes
 * mudarem, o teste continua dizendo a verdade.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveSkillNewDestination } from '../core/skills/skill-new-destination.js'
import { defaultSkillRoots } from '../core/skills/skill-registry.js'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-skill-dir-'))
  dirs.push(dir)
  return dir
}

describe('resolveSkillNewDestination — one meaning for --dir (AC1)', () => {
  it('resolves a project root to a directory the list command actually scans', () => {
    const root = project()

    const dest = resolveSkillNewDestination({ dir: root })

    // A asserção que importa: o destino tem de estar DENTRO de uma raiz varrida,
    // senão a skill nasce invisível — o defeito original.
    const roots = defaultSkillRoots(root)
    expect(roots.some((r) => dest.destination === r)).toBe(true)
    expect(dest.outsideScannedRoots).toBe(false)
  })

  it('an explicit --dest is honoured verbatim — nobody loses the old capability (AC2)', () => {
    const root = project()
    const explicit = join(root, 'algum', 'lugar', 'meu')

    const dest = resolveSkillNewDestination({ dir: root, dest: explicit })

    expect(dest.destination).toBe(explicit)
  })

  it('flags an explicit destination that no scanned root covers (AC3)', () => {
    // O aviso é o que impede a correção de recriar o defeito por outra porta:
    // se alguém insiste num destino fora das raízes, tem de saber que a skill
    // não vai aparecer no list.
    const root = project()
    const outside = join(project(), 'fora-do-projeto')

    const dest = resolveSkillNewDestination({ dir: root, dest: outside })

    expect(dest.outsideScannedRoots).toBe(true)
    expect(dest.warning).toMatch(/skill list|não aparecer|invisible/i)
  })

  it('an explicit destination INSIDE a scanned root is not flagged — no false alarm', () => {
    const root = project()
    const inside = join(defaultSkillRoots(root)[0], 'minha-skill-dir')

    const dest = resolveSkillNewDestination({ dir: root, dest: inside })

    expect(dest.outsideScannedRoots).toBe(false)
    expect(dest.warning).toBeUndefined()
  })

  it('does not create anything — resolution is a decision, not an effect', () => {
    const root = project()

    const dest = resolveSkillNewDestination({ dir: root })

    // Resolver não pode escrever: quem escreve é o scaffolder, depois de o
    // comando decidir. Misturar os dois é o que torna um erro de caminho
    // irreversível.
    expect(existsSync(dest.destination)).toBe(false)
  })
})
