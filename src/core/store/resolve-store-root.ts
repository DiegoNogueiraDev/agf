/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * resolveStoreRoot — raiz ÚNICA do estado persistente (graph.db + memórias)
 * para o modo worktree-por-formiga (node_db03edaf7caa, épico node_5581f7a45f3a).
 *
 * WHY: N formigas em worktrees próprios eliminam a interferência de árvore
 * compartilhada (done-gate, git index, blast), mas a colônia PRECISA de um
 * grafo único — e `workflow-graph/` é gitignored, não viaja entre worktrees
 * (a razão da rejeição antiga do worktree-per-ant). `AGF_GRAPH_ROOT` aponta
 * todas as formigas para o mesmo root central; ausente/blank ⇒ o `dir` do
 * caller, byte-idêntico ao comportamento de sempre.
 *
 * CONTRATO: puro (env lido a cada chamada — testável); `:memory:` passa
 * intacto (fixtures nunca são redirecionadas). Consumidores: SqliteStore.open,
 * open-store.ts (checks de existência/anchor) e memoriesPath (memory-reader).
 */

/** Sentinela do better-sqlite3 para banco em memória — nunca redirecionada. */
const IN_MEMORY = ':memory:'

export function resolveStoreRoot(dir: string): string {
  if (dir === IN_MEMORY) return dir
  const central = process.env.AGF_GRAPH_ROOT
  if (central !== undefined && central.trim().length > 0) return central
  return dir
}
