/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * commit-probe — a coleta de git para o detector `orphan_commit`
 * (node_9bb2e60a6390).
 *
 * Vive na borda (cli/shared) porque toca o mundo: o detector em
 * `core/gaps/detect-orphan-commit.ts` é puro e recebe o resultado. Mesmo
 * arranjo de `makeFileExists` para a triangulação física.
 *
 * NUNCA lança: roda dentro de `agf gaps`, e trocar um relatório de completude
 * por um stack trace de git seria estritamente pior. Repo sem git, histórico
 * curto ou comando indisponível devolvem lista vazia — e vazio aqui significa
 * "não consegui olhar", não "está tudo certo", razão pela qual o detector só
 * roda quando esta sonda é fornecida.
 */

import { spawnSync } from 'node:child_process'
import type { CommitProbe, ProbedCommit } from '../../core/gaps/detect-orphan-commit.js'

const GIT_TIMEOUT_MS = 10_000

/** Janela padrão: recente o bastante para ser acionável, longa o bastante para pegar um descuido. */
const DEFAULT_WINDOW = 30

/**
 * Colhe os últimos N commits com os arquivos que cada um tocou.
 * A janela é explícita porque varrer o histórico inteiro produz achados que
 * ninguém trata — e ruído nessa escala faz o sinal ser ignorado.
 */
export function makeCommitProbe(dir: string, window: number = DEFAULT_WINDOW): CommitProbe {
  return () => {
    const result = spawnSync('git', ['log', `-${window}`, '--name-only', '--format=%x00%H%x1f%s'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    })

    if (result.status !== 0 || typeof result.stdout !== 'string') return []

    const commits: ProbedCommit[] = []
    for (const block of result.stdout.split('\0')) {
      if (!block.trim()) continue
      const [header, ...rest] = block.split('\n')
      const [sha, subject] = header.split('\x1f')
      if (!sha) continue
      commits.push({ sha, subject: subject ?? '', files: rest.filter((l) => l.trim().length > 0) })
    }
    return commits
  }
}
