/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Corpus sourcing — de onde vêm os padrões para enriquecer geração E decisão.
 *
 * Brownfield (projeto já tem código): scan DETERMINÍSTICO do próprio projeto
 * (reusa `harness/collect-src`) extrai sinais de quais capacidades de scaffold já
 * aparecem no codebase — enviesa o ranking para padrões consistentes com o
 * projeto ("usa o próprio projeto para decidir"). 0 LLM.
 *
 * Greenfield (sem código): varre github.com (web fetch/scraping) via
 * graph-navigation → FATIA SEGUINTE. Borda criativa (tokens) → FATIA SEGUINTE.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { collectSrcFiles } from '../harness/collect-src.js'
import { SCAFFOLD_REGISTRY, type ScaffoldKind } from './registry.js'
import { githubCorpusSignals } from './github-corpus.js'
import type { SqliteStore } from '../store/sqlite-store.js'

export type ProjectMode = 'brownfield' | 'greenfield'

const CORPUS_ROOTS_KEY = 'corpus_roots'
const CORPUS_AUTODISCOVER_KEY = 'corpus_autodiscover'
const MAX_CORPUS_ROOTS = 24

export interface ProjectCorpus {
  readonly mode: ProjectMode
  readonly fileCount: number
  /** Nº de arquivos do projeto que exibem o padrão de cada scaffold kind. */
  readonly capabilitySignals: Readonly<Partial<Record<ScaffoldKind, number>>>
}

/** Determinístico: há fontes em `<dir>/src`? então brownfield. */
export function detectProjectMode(dir: string): ProjectMode {
  return collectSrcFiles(dir).length > 0 ? 'brownfield' : 'greenfield'
}

/**
 * Scan determinístico do projeto: conta, por kind, quantos arquivos contêm os
 * keywords daquele scaffold (sinal de "este padrão já é usado aqui").
 */
export function scanProjectCorpus(dir: string): ProjectCorpus {
  const files = collectSrcFiles(dir)
  if (files.length === 0) {
    return { mode: 'greenfield', fileCount: 0, capabilitySignals: {} }
  }
  const signals: Partial<Record<ScaffoldKind, number>> = {}
  for (const entry of SCAFFOLD_REGISTRY) {
    let count = 0
    for (const f of files) {
      const lc = f.content.toLowerCase()
      if (entry.keywords.some((kw) => lc.includes(kw.toLowerCase()))) count++
    }
    if (count > 0) signals[entry.kind] = count
  }
  return { mode: 'brownfield', fileCount: files.length, capabilitySignals: signals }
}

const boostCache = new Map<string, Readonly<Partial<Record<ScaffoldKind, number>>>>()

/**
 * Peso de ranking derivado do corpus do projeto (memoizado por dir). Normaliza
 * os sinais para [0,1] — pequeno empurrão a kinds já presentes no projeto.
 */
export function corpusPerfBoost(dir: string): Readonly<Partial<Record<ScaffoldKind, number>>> {
  return boostFromCorpus(dir, scanProjectCorpus(dir))
}

function boostFromCorpus(key: string, corpus: ProjectCorpus): Readonly<Partial<Record<ScaffoldKind, number>>> {
  const cached = boostCache.get(key)
  if (cached) return cached
  const max = Math.max(1, ...Object.values(corpus.capabilitySignals))
  const boost: Partial<Record<ScaffoldKind, number>> = {}
  for (const [kind, count] of Object.entries(corpus.capabilitySignals)) {
    boost[kind as ScaffoldKind] = (count ?? 0) / max // 0..1
  }
  boostCache.set(key, boost)
  return boost
}

// ── Corpus multi-projeto (dogfooding) — determinístico, sem hardcode de path ──

function isProjectDir(dir: string): boolean {
  return existsSync(join(dir, 'src')) || existsSync(join(dir, 'package.json'))
}

/** Descobre projetos irmãos (subdirs do pai do projeto que parecem projetos). */
function discoverSiblings(dir: string): string[] {
  const parent = dirname(resolve(dir))
  let entries: string[]
  try {
    entries = readdirSync(parent)
  } catch {
    return []
  }
  const out: string[] = []
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const full = join(parent, name)
    try {
      if (statSync(full).isDirectory() && isProjectDir(full)) out.push(full)
    } catch {
      /* ignora entradas ilegíveis */
    }
  }
  return out
}

/**
 * Resolve as raízes do corpus (determinístico): o próprio projeto + raízes
 * registradas em `corpus_roots` + (se `corpus_autodiscover=true`) projetos
 * irmãos. Deduplicado, só existentes, limitado a {@link MAX_CORPUS_ROOTS}.
 */
export function resolveCorpusRoots(store: SqliteStore, dir: string): string[] {
  const roots: string[] = [resolve(dir)]
  try {
    const raw = store.getProjectSetting(CORPUS_ROOTS_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) for (const r of arr) if (typeof r === 'string') roots.push(resolve(r))
    }
  } catch {
    /* setting ausente/inválido — ignora */
  }
  if (store.getProjectSetting(CORPUS_AUTODISCOVER_KEY) === 'true') {
    roots.push(...discoverSiblings(dir))
  }
  const seen = new Set<string>()
  const unique: string[] = []
  for (const r of roots) {
    if (seen.has(r) || !existsSync(r)) continue
    seen.add(r)
    unique.push(r)
    if (unique.length >= MAX_CORPUS_ROOTS) break
  }
  return unique
}

/** Registra uma raiz de corpus adicional (dogfooding multi-projeto). */
export function addCorpusRoot(store: SqliteStore, root: string): string[] {
  const resolved = resolve(root)
  let current: string[] = []
  try {
    const raw = store.getProjectSetting(CORPUS_ROOTS_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) current = arr.filter((r): r is string => typeof r === 'string')
    }
  } catch {
    /* ignora */
  }
  if (!current.includes(resolved)) current.push(resolved)
  store.setProjectSetting(CORPUS_ROOTS_KEY, JSON.stringify(current))
  return current
}

/** Agrega o scan de várias raízes num único corpus (soma de sinais). */
export function scanMultiCorpus(roots: readonly string[]): ProjectCorpus {
  const signals: Partial<Record<ScaffoldKind, number>> = {}
  let fileCount = 0
  for (const root of roots) {
    const c = scanProjectCorpus(root)
    fileCount += c.fileCount
    for (const [kind, n] of Object.entries(c.capabilitySignals)) {
      signals[kind as ScaffoldKind] = (signals[kind as ScaffoldKind] ?? 0) + (n ?? 0)
    }
  }
  return { mode: fileCount > 0 ? 'brownfield' : 'greenfield', fileCount, capabilitySignals: signals }
}

/**
 * Peso de ranking agregado sobre TODAS as raízes do corpus (próprio projeto +
 * registrados + irmãos). É assim que o dogfooding multi-projeto enviesa a decisão.
 */
export function corpusBoostForStore(store: SqliteStore, dir: string): Readonly<Partial<Record<ScaffoldKind, number>>> {
  const roots = resolveCorpusRoots(store, dir)
  const local = scanMultiCorpus(roots)
  // Greenfield: funde sinais cacheados do github (pássaros de outras florestas).
  const gh = githubCorpusSignals(store)
  const signals: Partial<Record<ScaffoldKind, number>> = { ...local.capabilitySignals }
  for (const [kind, n] of Object.entries(gh)) {
    signals[kind as ScaffoldKind] = (signals[kind as ScaffoldKind] ?? 0) + (n ?? 0)
  }
  const merged: ProjectCorpus = { mode: local.mode, fileCount: local.fileCount, capabilitySignals: signals }
  let pid = 'd'
  try {
    pid = store.getProject()?.id ?? 'd'
  } catch {
    /* store parcial (mock) */
  }
  return boostFromCorpus(`store:${pid}:${roots.join('|')}:gh${Object.keys(gh).length}`, merged)
}
