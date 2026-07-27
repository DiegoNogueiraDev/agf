/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task Signal — o sinal da task ATIVA para a poda task-aware (E2.T1,
 * node_86df3221cf87; contract node_6ee6fb0849cf).
 *
 * Squeez-style (arXiv 2604.04979): o grafo sabe qual task está in_progress —
 * vantagem estrutural do agf sobre agentes sem grafo. Este módulo extrai
 * {taskId, keywords, acLines} do node ativo para condicionar a compressão de
 * tool-output à tarefa em curso. Reusa {@link currentTaskId} (WIP=1: dois
 * in_progress = ambíguo = null, nunca adivinhar) e o tokenizador unificado
 * (stopwords PT/EN + accent-strip) — zero extrator novo.
 *
 * Contrato de não-regressão: sem task ativa ⇒ null ⇒ o estágio consumidor é
 * no-op byte-idêntico (risk node_37aeb5672ac2 absorvido aqui).
 */

import type Database from 'better-sqlite3'
import type { GraphNode } from '../graph/graph-types.js'
import { currentTaskId } from '../economy/attribution.js'
import { tokenize } from '../search/tokenizer.js'

export interface TaskSignal {
  taskId: string
  /** Keywords únicas de título+AC (minúsculas, sem stopwords PT/EN, sem acentos). */
  keywords: string[]
  acLines: string[]
}

/** Superfície mínima do store (SqliteStore satisfaz — DIP p/ teste :memory:). */
export interface TaskSignalStore {
  getDb(): Database.Database
  getNodeById(id: string): GraphNode | null
}

const MIN_KEYWORD_LENGTH = 3

/**
 * Suplemento LOCAL de stopwords do domínio GWT/spec (o tokenizador unificado
 * cobre artigos/preposições; aqui caem os conectores de AC que nunca são sinal).
 * Local de propósito — mudar a lista compartilhada mudaria ranking de busca/RAG.
 */
const SIGNAL_STOPWORDS = new Set([
  'given',
  'when',
  'then',
  'should',
  'quando',
  'entao',
  'deve',
  'devem',
  'para',
  'sobre',
  'todos',
  'todas',
  'that',
  'this',
  'with',
  'fazer',
])

/**
 * Extrai o sinal da task in_progress. Null quando não há exatamente UMA task
 * ativa ou o node sumiu — o chamador cai no comportamento atual.
 */
export function extractTaskSignal(store: TaskSignalStore): TaskSignal | null {
  const taskId = currentTaskId(store.getDb())
  if (!taskId) return null

  const node = store.getNodeById(taskId)
  if (!node) return null
  return buildSignalFromNode(node)
}

/** Sinal a partir de um node explícito (caminho `--task <id>` do compress run). */
export function buildSignalFromNode(node: GraphNode): TaskSignal {
  const acLines = node.acceptanceCriteria ?? []
  const text = [node.title, node.description ?? '', ...acLines].join(' ')
  const keywords = [...new Set(tokenize(text))].filter(
    (w) => w.length >= MIN_KEYWORD_LENGTH && !SIGNAL_STOPWORDS.has(w),
  )
  return { taskId: node.id, keywords, acLines }
}
