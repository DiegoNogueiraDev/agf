/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Hierarchical ToC-tree builder (PageIndex-style, adapted — original code).
 *
 * Folds the flat `Section[]` that `parser/segment` already produces (each
 * carrying a heading `level`) into a nested tree: every node gets a dotted
 * `treePath` ("1.2.3"), a `parentId`, and a **deterministic, extractive
 * TF-style `summary`** computed locally — no LLM call, ~0 token. This is the
 * raw index a tree-navigation retriever descends instead of scanning flat
 * top-k chunks (cuts input tokens; stays 100% local, no vectors).
 */

import { tokenize } from '../search/tokenizer.js'
import type { Section } from '../parser/segment.js'

/** A persisted node of the document ToC tree. */
export interface DocTreeNode {
  /** Stable id: `${documentId}:${treePath}`. */
  id: string
  /** Source document this node belongs to. */
  documentId: string
  /** Dotted position in the tree, e.g. "1.2.3". */
  treePath: string
  /** Heading depth (1 = `#`, 2 = `##`, …). */
  level: number
  title: string
  /** Section body (the retrievable content). */
  content: string
  /** Deterministic extractive summary (no LLM). */
  summary: string
  /** Parent node id, or null at the root. */
  parentId: string | null
  startLine: number
  endLine: number
}

interface StackFrame {
  level: number
  treePath: string
  id: string
  childCount: number
}

/**
 * Deterministic extractive summary: the highest term-frequency sentences of the
 * section (title + body), capped to `maxSentences`. Pure and LLM-free, mirroring
 * the TF ranking used by `community-summarizer`.
 */
export function summarizeExtractive(text: string, maxSentences = 2): string {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (sentences.length <= maxSentences) return sentences.join(' ')

  const tf = new Map<string, number>()
  for (const token of tokenize(text)) tf.set(token, (tf.get(token) ?? 0) + 1)

  const scored = sentences.map((sentence, index) => {
    const tokens = tokenize(sentence)
    const score = tokens.reduce((sum, t) => sum + (tf.get(t) ?? 0), 0) / (tokens.length || 1)
    return { sentence, index, score }
  })
  // Top-scoring sentences, then restore original reading order for coherence.
  const top = [...scored]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
  return top.map((s) => s.sentence).join(' ')
}

/** Build the hierarchical ToC tree from a flat, ordered list of sections. */
export function buildDocTree(sections: Section[], documentId: string): DocTreeNode[] {
  const nodes: DocTreeNode[] = []
  const stack: StackFrame[] = []
  let rootCount = 0

  for (const section of sections) {
    // Pop ancestors that are at the same or deeper level than this section.
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) stack.pop()

    const parent = stack[stack.length - 1]
    let treePath: string
    if (parent) {
      parent.childCount += 1
      treePath = `${parent.treePath}.${parent.childCount}`
    } else {
      rootCount += 1
      treePath = `${rootCount}`
    }

    const id = `${documentId}:${treePath}`
    nodes.push({
      id,
      documentId,
      treePath,
      level: section.level,
      title: section.title,
      content: section.body,
      summary: summarizeExtractive(`${section.title}. ${section.body}`),
      parentId: parent ? parent.id : null,
      startLine: section.startLine,
      endLine: section.endLine,
    })
    stack.push({ level: section.level, treePath, id, childCount: 0 })
  }

  return nodes
}
