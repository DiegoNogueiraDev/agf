/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_260de3eb9cb5 — a primeira mensagem de erro que um operador novo recebe
 * não pode acusá-lo de não ter feito o que ele acabou de fazer.
 *
 * Medido num sandbox limpo: o operador cria `hello.md`, roda `agf done` e
 * recebe *"No modified files found. Tasks must be implemented before marking
 * done."* — porque o gate lê `git diff HEAD`, que não enxerga arquivo
 * untracked. A informação que faltava (existe um arquivo novo, ele só não foi
 * indexado) já está disponível a um `git status` de distância; o que faltava
 * era ALGUÉM PERGUNTAR antes de escolher a mensagem.
 *
 * Este módulo é a pergunta: dado um diretório, quais arquivos novos existem
 * que o diff não vê? A resposta transforma uma acusação genérica numa
 * instrução com o nome do arquivo e o comando que resolve.
 *
 * Zero dublê: repositórios git reais em diretórios temporários.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { diagnoseUntracked } from '../core/git/diagnose-untracked.js'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})

/** Um repositório git real com um commit — o estado de quem acabou de começar. */
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-untracked-'))
  dirs.push(dir)
  execSync('git init -q', { cwd: dir })
  execSync('git config user.email "t@t.com"', { cwd: dir })
  execSync('git config user.name "T"', { cwd: dir })
  writeFileSync(join(dir, 'README.md'), '# repo\n')
  execSync('git add README.md', { cwd: dir })
  execSync('git commit -qm init', { cwd: dir })
  return dir
}

describe('diagnoseUntracked — what the diff gate cannot see', () => {
  it('names the untracked file the operator just created', () => {
    const dir = repo()
    writeFileSync(join(dir, 'hello.md'), 'olá\n')

    const found = diagnoseUntracked(dir)

    expect(found).toContain('hello.md')
  })

  it('reports nothing when the tree is genuinely clean — no spurious noise (AC2)', () => {
    // A metade que impede a correção de virar ruído: sem arquivo novo, não há
    // diagnóstico a dar, e uma dica exibida sempre deixa de ser lida.
    expect(diagnoseUntracked(repo())).toEqual([])
  })

  it('ignores files already staged — those the gate can already see', () => {
    const dir = repo()
    writeFileSync(join(dir, 'staged.md'), 'x\n')
    execSync('git add staged.md', { cwd: dir })

    expect(diagnoseUntracked(dir)).toEqual([])
  })

  it('sees a file nested inside an entirely new directory', () => {
    // `git status --porcelain` colapsa um diretório novo inteiro num único
    // `?? dir/`, escondendo o arquivo lá dentro — e o operador que criou
    // `src/novo.ts` receberia uma dica sobre `src/`, que não é o que ele fez.
    const dir = repo()
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'novo.ts'), 'export {}\n')

    expect(diagnoseUntracked(dir)).toContain('src/novo.ts')
  })

  it('a directory that is not a git repository yields no diagnosis instead of throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-nogit-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'solto.md'), 'x\n')

    // Este caminho roda dentro de um gate de erro: lançar aqui trocaria uma
    // mensagem ruim por um stack trace, que é estritamente pior.
    expect(() => diagnoseUntracked(dir)).not.toThrow()
    expect(diagnoseUntracked(dir)).toEqual([])
  })
})

describe('diagnoseUntracked — ranking: what the OPERATOR made comes before scaffolding', () => {
  it("puts the operator's own file ahead of tool-generated dotfiles", () => {
    // Medido no sandbox: `agf init` deixa 15 untracked seus (.claude/,
    // .claudeignore, …). Se a dica pega o primeiro em ordem alfabética, ela
    // manda `git add .claude/rules/...` para quem criou `hello.md` — um
    // conselho errado com cara de precisão, pior que a mensagem genérica.
    const dir = repo()
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'rules', 'tests.md'), 'x\n')
    writeFileSync(join(dir, '.claudeignore'), 'x\n')
    writeFileSync(join(dir, 'hello.md'), 'olá\n')

    const found = diagnoseUntracked(dir)

    expect(found[0]).toBe('hello.md')
  })

  it('still reports the dotfiles — ranking hides nothing, it only orders', () => {
    const dir = repo()
    writeFileSync(join(dir, '.claudeignore'), 'x\n')
    writeFileSync(join(dir, 'hello.md'), 'olá\n')

    expect(diagnoseUntracked(dir)).toContain('.claudeignore')
  })

  it('with only tool files present, the first candidate is still a real path', () => {
    const dir = repo()
    writeFileSync(join(dir, '.claudeignore'), 'x\n')

    expect(diagnoseUntracked(dir)[0]).toBe('.claudeignore')
  })
})
