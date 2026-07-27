/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * diagnose-untracked — o que o gate de diff NÃO enxerga (node_260de3eb9cb5).
 *
 * PORQUÊ: `agf done` decide por `git diff --diff-filter=MARD HEAD`, que ignora
 * arquivo untracked. Quem acabou de criar `hello.md` e roda `done` recebe
 * *"No modified files found. Tasks must be implemented before marking done."*
 * — uma acusação de não ter implementado, dirigida a quem implementou. É o
 * primeiro erro que um operador novo encontra.
 *
 * O dado que faltava sempre esteve a um `git status` de distância; faltava
 * PERGUNTAR antes de escolher a mensagem. Este módulo faz a pergunta e devolve
 * os caminhos, para que o chamador troque uma acusação genérica por uma
 * instrução com nome de arquivo.
 *
 * Complementa {@link autoStageDeclaredFiles} (auto-stage-declared-files.ts),
 * que resolve o caso em que os arquivos foram DECLARADOS. Aqui não há
 * declaração alguma — é justamente o caso do operador que ainda não sabe que
 * precisa declarar.
 *
 * CONTRATO: nunca lança. Roda dentro de um caminho de erro, e trocar uma
 * mensagem ruim por um stack trace é estritamente pior.
 */

import { spawnSync } from 'node:child_process'

const GIT_TIMEOUT_MS = 10_000

/** Prefixo do `git status --porcelain` para caminho não-rastreado. */
const UNTRACKED_PREFIX = '?? '

/**
 * Caminhos novos que o gate de diff não vê. Vazio quando não há nenhum, quando
 * o diretório não é um repositório git, ou quando o git falha por qualquer
 * motivo — ausência de diagnóstico nunca vira exceção.
 */
export function diagnoseUntracked(dir: string): string[] {
  // `-uall` é o que torna o diagnóstico útil: sem ele, um diretório novo
  // inteiro colapsa num único `?? src/`, e o operador que criou `src/novo.ts`
  // receberia uma dica sobre `src/` — que não é o que ele fez.
  const status = spawnSync('git', ['status', '--porcelain', '-uall'], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: GIT_TIMEOUT_MS,
  })

  if (status.status !== 0 || typeof status.stdout !== 'string') return []

  const paths = status.stdout
    .split('\n')
    .filter((line) => line.startsWith(UNTRACKED_PREFIX))
    .map((line) => line.slice(UNTRACKED_PREFIX.length).trim())
    .filter((path) => path.length > 0)

  return rankByLikelyAuthor(paths)
}

/**
 * Ordena pelo que o OPERADOR provavelmente escreveu.
 *
 * PORQUÊ: `agf init` deixa ~15 arquivos untracked seus, e uma lista em ordem
 * alfabética começa por eles. Ordenar ajuda a LER a lista — mas não resolve o
 * problema de fundo, e é importante dizer isso aqui: não há como saber qual
 * arquivo o operador escreveu. A primeira versão desta correção afirmava
 * `git add <primeiro-da-lista>`, e no sandbox real isso apontou para
 * `AGENTS.md` (gerado pelo init) em vez de `hello.md` — palpite com aparência
 * de precisão, pior que a mensagem genérica que substituiu. Por isso o
 * chamador usa `<file>` como placeholder: a lista é evidência, a escolha é do
 * operador. Este ranking apenas põe artefatos de ferramenta no fim.
 */
function rankByLikelyAuthor(paths: string[]): string[] {
  const isToolArtifact = (p: string): boolean => p.startsWith('.') || p.includes('/.')
  return [...paths].sort((a, b) => Number(isToolArtifact(a)) - Number(isToolArtifact(b)))
}
