/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Worktree-per-ant provisioning — FONTE ÚNICA, camada core.
 *
 * PORQUÊ: em árvore compartilhada o paralelismo da colônia satura em ~3-5
 * formigas (done-gate lê a árvore inteira; git index sem coordenação). Cada
 * formiga ganha um git worktree próprio (branch `ant/<id>` a partir do HEAD),
 * isolando arquivos mas mantendo a estigmergia via AGF_GRAPH_ROOT central.
 *
 * Esta lógica vivia dentro de `src/cli/commands/ant-cmd.ts`; foi extraída para
 * core para ser REUSADA pelo 2º binário `ant-swarming` (que não pode importar de
 * ../cli — isolamento de camada). Tanto `agf ant spawn` quanto `ant-swarming
 * spawn` provisionam pelo MESMO caminho aqui — do not recreate.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, symlinkSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { McpGraphError } from '../utils/errors.js'

/** Id de formiga: seguro para path e branch (sem separadores/traversal). */
export const ANT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i

/** Erro tipado do provisionamento — `code` para o envelope da superfície chamadora. */
export class AntProvisionError extends McpGraphError {
  constructor(
    readonly code: 'INVALID_ANT_ID' | 'NOT_A_GIT_REPO' | 'WORKTREE_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'AntProvisionError'
  }
}

/** True quando o id é seguro para virar segmento de path e nome de branch. */
export function isSafeAntId(id: string): boolean {
  return ANT_ID_PATTERN.test(id)
}

/**
 * git com env saneado: dentro de um git-hook o git exporta GIT_DIR/GIT_INDEX_FILE/
 * GIT_WORK_TREE — herdá-los faria estes spawns operarem no repo PAI em vez do
 * `cwd` pedido (worktree fantasma no repo errado). execFile → sem shell, sem injeção.
 */
export function gitIn(cwd: string, ...args: string[]): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  return execFileSync('git', args, { cwd, encoding: 'utf-8', env }).trim()
}

/** Raiz do repo git de `dir`, ou null se não for um repo. */
export function resolveRepoRoot(dir: string): string | null {
  try {
    return gitIn(dir, 'rev-parse', '--show-toplevel')
  } catch {
    return null
  }
}

/** Diretório-irmão que agrupa os worktrees da colônia: `<repo>-ants/`. */
export function antsDirFor(repoRoot: string): string {
  return join(dirname(repoRoot), `${basename(repoRoot)}-ants`)
}

export interface AntWorktree {
  id: string
  path: string
  branch?: string
  /** true quando um worktree vivo foi reusado (idempotência). */
  reused?: boolean
}

/** Worktrees vivos sob `<repo>-ants/` (parse do `git worktree list --porcelain`). */
export function listAntWorktrees(repoRoot: string): AntWorktree[] {
  const antsDir = antsDirFor(repoRoot)
  const ants: AntWorktree[] = []
  let current: Partial<AntWorktree> = {}
  const commit = (): void => {
    if (current.path?.startsWith(antsDir)) {
      ants.push({ id: basename(current.path), path: current.path, branch: current.branch })
    }
  }
  for (const line of gitIn(repoRoot, 'worktree', 'list', '--porcelain').split('\n')) {
    if (line.startsWith('worktree ')) current = { path: line.slice('worktree '.length) }
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace('refs/heads/', '')
    else if (line === '') {
      commit()
      current = {}
    }
  }
  commit()
  return ants
}

/**
 * Deps gitignored não viajam no worktree (mesma classe do graph.db): symlinka o
 * node_modules do repo raiz na formiga — mesmo disco, mesma arch, zero cópia.
 * Sem node_modules na raiz ⇒ no-op silencioso.
 */
export function linkNodeModules(repoRoot: string, wtPath: string): void {
  const source = join(repoRoot, 'node_modules')
  const target = join(wtPath, 'node_modules')
  if (!existsSync(source) || existsSync(target)) return
  symlinkSync(source, target, 'dir')
}

/**
 * Provisiona (ou reusa) o worktree da formiga em `<repo>-ants/<id>` na branch
 * `ant/<id>`. Idempotente: um worktree vivo é reusado (mesmo path, zero órfão).
 * Valida o id contra path traversal ANTES de tocar o disco.
 *
 * @throws {AntProvisionError} INVALID_ANT_ID (id inseguro) · WORKTREE_FAILED (git falhou).
 */
export function provisionAntWorktree(repoRoot: string, id: string): AntWorktree {
  if (!isSafeAntId(id)) {
    throw new AntProvisionError(
      'INVALID_ANT_ID',
      `Id de formiga inválido: "${id}" (use [a-z0-9._-], sem separadores de path)`,
    )
  }
  const wtPath = join(antsDirFor(repoRoot), id)
  const branch = `ant/${id}`
  if (existsSync(wtPath)) return { id, path: wtPath, branch, reused: true }
  try {
    const branchExists = gitIn(repoRoot, 'branch', '--list', branch) !== ''
    if (branchExists) gitIn(repoRoot, 'worktree', 'add', wtPath, branch)
    else gitIn(repoRoot, 'worktree', 'add', '-b', branch, wtPath, 'HEAD')
    linkNodeModules(repoRoot, wtPath)
    return { id, path: wtPath, branch, reused: false }
  } catch (err) {
    throw new AntProvisionError(
      'WORKTREE_FAILED',
      `git worktree add falhou: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
