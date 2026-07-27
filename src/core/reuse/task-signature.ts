/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_0160dacfad38 — Assinatura estável de uma task para reuso determinístico
 * de artefatos. Normaliza título (caixa/espaços), ordena AC e tags (ordem
 * irrelevante) e inclui o type; produz um hash SHA-256 hex. Pura — a mesma task
 * sempre gera a mesma assinatura, base do cache de artefatos.
 */
import { createHash } from 'node:crypto'

export interface TaskSignatureInput {
  title: string
  acceptanceCriteria?: string[]
  type?: string
  tags?: string[]
}

/** Normaliza texto: trim, minúsculas, espaços colapsados. */
function norm(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Lista normalizada e ordenada (ordem de entrada irrelevante). */
function normSorted(items: string[] | undefined): string[] {
  return (items ?? [])
    .map(norm)
    .filter((s) => s.length > 0)
    .sort()
}

/**
 * Calcula a assinatura determinística da task. Campos canônicos serializados em
 * JSON estável → SHA-256 hex (64 chars).
 */
export function computeTaskSignature(input: TaskSignatureInput): string {
  const canonical = {
    title: norm(input.title),
    type: norm(input.type ?? 'task'),
    ac: normSorted(input.acceptanceCriteria),
    tags: normSorted(input.tags),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
