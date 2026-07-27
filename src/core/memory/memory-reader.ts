/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Native Memory Reader — reads/writes project memories from workflow-graph/memories/.
 * Replaces the Serena MCP dependency for memory management.
 */

import path from 'node:path'
import { readdir, readFile, writeFile, mkdir, unlink, rename, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { McpGraphError, getErrorMessage } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'
import { STORE_DIR } from '../utils/constants.js'
import { assertPathInside } from '../utils/safe-path.js'
import { scoreMemoryActivation, selectByActivation, type ScoredMemory } from './memory-salience.js'
import {
  isMemoryDedupDisabled,
  getDedupWindow,
  shouldSkipDedup,
  findNearDuplicates,
  vectorizeForDedup,
} from '../hooks/memory-dedup-detector.js'
import { isMemoryStalenessDisabled, findStaleMemories, type MemoryRef } from '../hooks/memory-staleness.js'
import { getSharedHookBus } from '../hooks/shared-hook-bus.js'
import { ncd } from '../economy/ncd-dedup.js'
import { resolveStoreRoot } from '../store/resolve-store-root.js'
import { isLeverEnabled, getLeverParam, type EconomyLeversConfig } from '../economy/economy-levers-config.js'

const log = createLogger({ layer: 'core', source: 'memory-reader.ts' })

export interface ProjectMemory {
  name: string
  content: string
  sizeBytes: number
  /** ISO-8601 timestamp from when this memory is valid. Null = always valid from creation. */
  validFrom?: string | null
  /** ISO-8601 timestamp until when this memory is valid. Null = no expiry. */
  validUntil?: string | null
  /** Salience inicial gravada no write (amortize, node_5c8bbec46123). */
  salience?: number
}

export interface WriteMemoryOptions {
  /** ISO-8601 timestamp. Defaults to current time if not provided. */
  validFrom?: string | null
  /** ISO-8601 timestamp for expiry. Null = no expiry (default). */
  validUntil?: string | null
  /** node_5c8bbec46123 — amortizar na escrita (mem0): dedupe/salience 1x na gravação. */
  amortize?: MemoryAmortizeOptions
}

/**
 * Amortize-on-write (playbook mem0): organizar/comprimir a memória UMA vez na
 * gravação, para que as N leituras por sessão não recomputem nada. Ausente ⇒
 * caminho de escrita byte-idêntico ao atual (levers default-OFF).
 */
export interface MemoryAmortizeOptions {
  /** Lever ncd_dedup: NCD ≤ threshold com uma memória existente ⇒ funde nela. */
  dedupeThreshold?: number
  /** Lever memory_salience: grava a salience inicial (1) no frontmatter. */
  stampSalience?: boolean
}

/** Resultado da gravação: 'fused' = anexada a uma memória existente similar. */
export interface WriteMemoryOutcome {
  outcome: 'written' | 'fused'
  /** Nome da memória existente que absorveu o conteúdo (só em 'fused'). */
  fusedInto?: string
}

export interface MemorySearchResult {
  name: string
  snippet: string
  score: number
  /** ISO-8601 expiry timestamp. Null/undefined = no expiry (always valid). */
  validUntil?: string | null
  /** Name of the memory that supersedes this one. When set, recall excludes this fact. */
  supersededBy?: string
  /** Source confidence: 'extracted' (from evidence) | 'inferred' (reasoned). */
  confidence?: string
  /** Monotonic version counter for the same fact lineage. */
  version?: number
}

export interface ParsedFrontmatter {
  validUntil?: string | null
  validFrom?: string | null
  supersededBy?: string
  confidence?: string
  version?: number
}

/** Parse typed-relations frontmatter fields from raw memory file content. */
export function parseMemoryFrontmatter(raw: string): ParsedFrontmatter {
  const { meta } = parseFrontmatter(raw)
  return {
    validFrom: meta['valid_from'] !== undefined ? meta['valid_from'] : undefined,
    validUntil: meta['valid_until'] !== undefined ? meta['valid_until'] : undefined,
    supersededBy: meta['superseded_by'] != null ? (meta['superseded_by'] as string) : undefined,
    confidence: meta['confidence'] != null ? (meta['confidence'] as string) : undefined,
    version: meta['version'] != null ? parseInt(meta['version'] as string, 10) || undefined : undefined,
  }
}

const MEMORIES_DIR = 'memories'

/**
 * Resolve the absolute path to the memories directory.
 */
function memoriesPath(basePath: string): string {
  // node_db03edaf7caa — memórias seguem o grafo: em modo worktree-por-formiga
  // (AGF_GRAPH_ROOT) as trilhas da colônia vivem no root central, não no worktree.
  return path.join(resolveStoreRoot(basePath), STORE_DIR, MEMORIES_DIR)
}

/**
 * Validate that a memory name resolves to a path inside the memories directory.
 * Uses centralized assertPathInside for comprehensive traversal protection (Bug #003).
 */
function safePath(basePath: string, name: string): string {
  const memDir = path.resolve(memoriesPath(basePath))
  return assertPathInside(`${name}.md`, memDir)
}

/**
 * Recursively collect all .md files under a directory, returning paths relative to root.
 */
async function collectMdFiles(dir: string, root: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await collectMdFiles(fullPath, root)
      results.push(...nested)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relative = path.relative(root, fullPath).replace(/\\/g, '/')
      results.push(relative.replace(/\.md$/, ''))
    }
  }

  return results
}

/**
 * List all memory files from workflow-graph/memories/ (supports nested dirs).
 */
export async function listMemories(basePath: string): Promise<string[]> {
  try {
    const dir = memoriesPath(basePath)
    return await collectMdFiles(dir, dir)
  } catch (err) {
    log.info('No memories directory found', { basePath, error: getErrorMessage(err) })
    return []
  }
}

/**
 * Read a specific memory file.
 */
export async function readMemory(basePath: string, name: string): Promise<ProjectMemory | null> {
  try {
    const filePath = safePath(basePath, name)
    const raw = await readFile(filePath, 'utf-8')
    const { meta, body } = parseFrontmatter(raw)
    return {
      name,
      content: body,
      sizeBytes: Buffer.byteLength(raw, 'utf-8'),
      validFrom: meta['valid_from'] !== undefined ? meta['valid_from'] : undefined,
      validUntil: meta['valid_until'] !== undefined ? meta['valid_until'] : undefined,
      ...(meta['salience'] != null && Number.isFinite(parseFloat(meta['salience'] as string))
        ? { salience: parseFloat(meta['salience'] as string) }
        : {}),
    }
  } catch (err) {
    log.debug('Memory not found', { name, error: getErrorMessage(err) })
    return null
  }
}

/**
 * Read all memories at once.
 */
export async function readAllMemories(basePath: string): Promise<ProjectMemory[]> {
  const names = await listMemories(basePath)
  const memories: ProjectMemory[] = []

  for (const name of names) {
    const memory = await readMemory(basePath, name)
    if (memory) memories.push(memory)
  }

  return memories
}

/** Parse YAML-style frontmatter block from memory file content. */
function parseFrontmatter(raw: string): { meta: Record<string, string | null>; body: string } {
  if (!raw.startsWith('---\n')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return { meta: {}, body: raw }
  const fmLines = raw.slice(4, end).split('\n')
  const meta: Record<string, string | null> = {}
  for (const line of fmLines) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const val = line.slice(colon + 1).trim()
    meta[key] = val === 'null' || val === '' ? null : val
  }
  return { meta, body: raw.slice(end + 5) }
}

/** Serialize validity metadata as YAML frontmatter. Returns empty string when no metadata. */
function buildFrontmatter(
  validFrom: string | null | undefined,
  validUntil: string | null | undefined,
  salience?: number,
): string {
  if (validFrom == null && validUntil == null && salience === undefined) return ''
  const lines = ['---']
  if (validFrom !== undefined && validFrom !== null) lines.push(`valid_from: ${validFrom}`)
  else if (validFrom === null) lines.push('valid_from: null')
  if (validUntil !== undefined && validUntil !== null) lines.push(`valid_until: ${validUntil}`)
  else if (validUntil === null) lines.push('valid_until: null')
  if (salience !== undefined) lines.push(`salience: ${salience}`)
  lines.push('---', '')
  return lines.join('\n')
}

/**
 * Write a memory file. Creates parent directories if needed.
 */
export async function writeMemory(
  basePath: string,
  name: string,
  content: string,
  opts?: WriteMemoryOptions,
): Promise<WriteMemoryOutcome> {
  if (!name || name.trim().length === 0) {
    throw new McpGraphError('Memory name cannot be empty')
  }
  const filePath = safePath(basePath, name)
  const dir = path.dirname(filePath)

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  // node_5c8bbec46123 — amortizar na escrita: dedupe NCD pago UMA vez aqui;
  // nenhuma leitura recomputa. Sem amortize ⇒ caminho byte-idêntico ao atual.
  if (opts?.amortize?.dedupeThreshold !== undefined) {
    const fusedInto = await fuseIntoSimilarMemory(basePath, name, content, opts.amortize.dedupeThreshold)
    if (fusedInto) return { outcome: 'fused', fusedInto }
  }

  const salience = opts?.amortize?.stampSalience ? INITIAL_SALIENCE : undefined
  const fm = buildFrontmatter(opts?.validFrom, opts?.validUntil, salience)
  const finalContent = fm ? fm + content : content

  // Atomic write: write to temp file then rename (prevents corrupted reads on concurrent access)
  const tmpPath = `${filePath}.tmp.${Date.now()}`
  await writeFile(tmpPath, finalContent, 'utf-8')
  await rename(tmpPath, filePath)
  log.info('Memory written', { name, sizeBytes: Buffer.byteLength(finalContent, 'utf-8') })

  await checkMemoryDedup(basePath, name, content)
  return { outcome: 'written' }
}

/** Salience inicial de uma memória recém-gravada (ACT-R: ativação máxima no uso). */
const INITIAL_SALIENCE = 1

/**
 * Procura a memória existente mais similar (menor NCD ≤ threshold; empate →
 * menor nome) e ANEXA o conteúdo novo a ela em vez de criar duplicata. Retorna
 * o nome fundido, ou null quando nada é similar o bastante. Conteúdo já contido
 * na existente não é re-anexado (fusão idempotente).
 */
async function fuseIntoSimilarMemory(
  basePath: string,
  name: string,
  content: string,
  threshold: number,
): Promise<string | null> {
  const existing = (await readAllMemories(basePath)).filter((m) => m.name !== name)
  let best: { name: string; distance: number; content: string } | null = null
  for (const m of existing.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const distance = ncd(content, m.content)
    if (distance > threshold) continue
    if (!best || distance < best.distance) best = { name: m.name, distance, content: m.content }
  }
  if (!best) return null

  if (!best.content.includes(content)) {
    const filePath = safePath(basePath, best.name)
    const raw = await readFile(filePath, 'utf-8')
    const tmpPath = `${filePath}.tmp.${Date.now()}`
    await writeFile(tmpPath, `${raw.trimEnd()}\n\n${content}\n`, 'utf-8')
    await rename(tmpPath, filePath)
  }

  log.info('memory:amortize:fused', { name, fusedInto: best.name, ncd: best.distance })
  getSharedHookBus().emitSync({
    channel: 'memory:post-store',
    timestamp: new Date().toISOString(),
    payload: { name, fusedInto: best.name, ncdDistance: best.distance },
  })
  return best.name
}

/**
 * Best-effort near-duplicate check against the recent-memory window — observational
 * only (emits `memory:post-store`, never blocks or throws on the write path).
 */
async function checkMemoryDedup(basePath: string, name: string, content: string): Promise<void> {
  if (isMemoryDedupDisabled() || shouldSkipDedup(content)) return
  try {
    const existing = (await readAllMemories(basePath)).filter((m) => m.name !== name).slice(-getDedupWindow())
    if (existing.length === 0) return
    const [newVec, ...existingVecs] = vectorizeForDedup([
      { id: name, text: content },
      ...existing.map((m) => ({ id: m.name, text: m.content })),
    ])
    const duplicates = findNearDuplicates(newVec, existingVecs)
    if (duplicates.length === 0) return
    log.info('memory:dedup:near-duplicate', { name, duplicates })
    getSharedHookBus().emitSync({
      channel: 'memory:post-store',
      timestamp: new Date().toISOString(),
      payload: { name, duplicates },
    })
  } catch (err) {
    log.warn('memory:dedup:check-failed', { name, error: getErrorMessage(err) })
  }
}

/**
 * Delete a memory file. Returns true if deleted, false if not found.
 */
export async function deleteMemory(basePath: string, name: string): Promise<boolean> {
  try {
    const filePath = safePath(basePath, name)
    await unlink(filePath)
    log.info('Memory deleted', { name })
    return true
  } catch (err) {
    log.debug('Memory delete failed', { name, error: getErrorMessage(err) })
    return false
  }
}

/**
 * Search across all memory files for a query string.
 * Returns matches sorted by relevance (score = term frequency × 100 / content length).
 * Results truncated at `limit` with snippet context around matches.
 */
export async function searchMemories(basePath: string, query: string, limit = 10): Promise<MemorySearchResult[]> {
  const all = await readAllMemories(basePath)
  if (all.length === 0) return []

  const q = query.toLowerCase()
  const results: MemorySearchResult[] = []

  for (const mem of all) {
    const contentLower = mem.content.toLowerCase()
    let score = 0
    let lastIdx = -1

    while ((lastIdx = contentLower.indexOf(q, lastIdx + 1)) !== -1) {
      score++
    }
    if (score === 0) continue

    const firstIdx = contentLower.indexOf(q)
    const snippet = buildMemorySnippet(mem.content, firstIdx, q.length)

    results.push({ name: mem.name, snippet, score })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Build a snippet of context around the first query match (±60 chars, ellipsized).
 * Extracted so both {@link searchMemories} and {@link rankMemoriesByActivation} share it.
 */
export function buildMemorySnippet(content: string, firstIdx: number, queryLen: number): string {
  if (firstIdx < 0) return content.slice(0, 120)
  const start = Math.max(0, firstIdx - 60)
  const end = Math.min(content.length, firstIdx + queryLen + 60)
  let snippet = content.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < content.length) snippet = snippet + '…'
  return snippet
}

/** Heuristic injection cost of a snippet (~4 chars/token), floored at 1. */
function estimateSnippetTokens(snippet: string): number {
  return Math.max(1, Math.ceil(snippet.length / 4))
}

/**
 * Rank project memories by ACT-R / Ebbinghaus base-level activation (recency × frequency
 * + spreading) instead of raw occurrence count, then keep the top `limit` above `threshold`.
 *
 * Additive sibling of {@link searchMemories} (which is left byte-identical): the
 * `memory_salience` token-economy lever — injects fewer, higher-value memories.
 * Returns the kept memories plus the token cost of everything dropped (the saving).
 */
export async function rankMemoriesByActivation(
  basePath: string,
  query: string,
  opts: { limit?: number; nowMs?: number; threshold?: number; relativeThreshold?: number; decay?: number } = {},
): Promise<{ kept: MemorySearchResult[]; droppedTokens: number }> {
  const limit = opts.limit ?? 10
  const nowMs = opts.nowMs ?? Date.now()
  const q = query.toLowerCase()

  const names = await listMemories(basePath)
  const scored: ScoredMemory[] = []

  for (const name of names) {
    let content: string
    let mtimeMs: number
    try {
      const filePath = safePath(basePath, name)
      content = await readFile(filePath, 'utf-8')
      mtimeMs = (await stat(filePath)).mtimeMs
    } catch (err) {
      log.debug('Memory rank: read failed', { name, error: getErrorMessage(err) })
      continue
    }

    const fm = parseMemoryFrontmatter(content)

    const { occurrences, activation } = scoreMemoryActivation({ content, query, mtimeMs, nowMs }, { decay: opts.decay })
    if (occurrences === 0) continue

    const snippet = buildMemorySnippet(content, content.toLowerCase().indexOf(q), q.length)
    scored.push({
      result: {
        name,
        snippet,
        score: activation,
        validUntil: fm.validUntil,
        supersededBy: fm.supersededBy,
        confidence: fm.confidence,
        version: fm.version,
      },
      activation,
      tokens: estimateSnippetTokens(snippet),
    })
  }

  return selectByActivation(scored, {
    limit,
    threshold: opts.threshold ?? -Infinity,
    relativeThreshold: opts.relativeThreshold,
  })
}

/** List every memory with its file mtime — the I/O half of memory-staleness.ts's pure decision. */
export async function listMemoryRefs(basePath: string): Promise<MemoryRef[]> {
  const names = await listMemories(basePath)
  const refs: MemoryRef[] = []
  for (const name of names) {
    try {
      const filePath = safePath(basePath, name)
      const { mtimeMs } = await stat(filePath)
      refs.push({ id: name, title: name, updatedAt: mtimeMs })
    } catch (err) {
      log.debug('Memory staleness: stat failed', { name, error: getErrorMessage(err) })
    }
  }
  return refs
}

/**
 * Compute stale memories (no refresh in STALE_AGE_DAYS) and emit
 * `session:memory-staleness` on the shared HookBus — called once per
 * session:start (see session-lifecycle.ts's emitSessionStart caller in
 * cli/index.ts). Best-effort: never throws, MCP_GRAPH_MEMORY_STALENESS=off
 * disables it.
 */
export async function checkMemoryStaleness(basePath: string): Promise<void> {
  if (isMemoryStalenessDisabled()) return
  try {
    const refs = await listMemoryRefs(basePath)
    const stale = findStaleMemories(refs)
    if (stale.length === 0) return
    log.info('memory:staleness:found', { count: stale.length })
    getSharedHookBus().emitSync({
      channel: 'session:memory-staleness',
      timestamp: new Date().toISOString(),
      payload: { stale },
    })
  } catch (err) {
    log.warn('memory:staleness:check-failed', { error: getErrorMessage(err) })
  }
}

/**
 * Mapper puro lever → opções de amortize-on-write (node_5c8bbec46123).
 * Tudo OFF ⇒ undefined, garantindo o caminho de escrita byte-idêntico. O
 * plumbing de abrir o store e resolver a config fica no caller (CLI boundary).
 */
export function amortizeFromLevers(cfg: EconomyLeversConfig): MemoryAmortizeOptions | undefined {
  const dedupe = isLeverEnabled(cfg, 'ncd_dedup')
  const salience = isLeverEnabled(cfg, 'memory_salience')
  if (!dedupe && !salience) return undefined
  return {
    ...(dedupe ? { dedupeThreshold: getLeverParam(cfg, 'ncd_dedup', 'threshold', 0.3) } : {}),
    ...(salience ? { stampSalience: true } : {}),
  }
}
