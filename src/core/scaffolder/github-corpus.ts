/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * GitHub Corpus (greenfield) — os "pássaros" trazendo sementes de outras florestas.
 *
 * Quando não há código local (greenfield), varre o github.com por scaffolds/
 * boilerplate (API JSON) e deriva sinais de capacidade (mesmo keyword-scan do
 * corpus brownfield) para enviesar a decisão. O resultado é CACHEADO
 * (`github_corpus_cache`) → determinístico e offline após a 1ª varredura. 0 LLM.
 *
 * `fetchJson` é injetável (testes usam fake; produção usa fetch nativo com
 * timeout + User-Agent exigido pela API do GitHub). Falha de rede → corpus vazio
 * (degrada graciosamente, nunca lança).
 */
import type Database from 'better-sqlite3'
import type { SqliteStore } from '../store/sqlite-store.js'
import { SCAFFOLD_REGISTRY, type ScaffoldKind } from './registry.js'
import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'
import { z } from 'zod/v4'

const githubRepoSchema = z.object({
  name: z.string().optional(),
  fullName: z.string().optional(),
  url: z.string(),
  stars: z.number(),
  description: z.string(),
  topics: z.array(z.string()),
})

const githubCorpusSchema = z.object({
  query: z.string().optional().default(''),
  repos: z.array(githubRepoSchema),
  capabilitySignals: z.record(z.string(), z.number()).optional().default({}),
})

/** Parse and validate an external GithubCorpus JSON string. Throws on malformed input. */
export function parseGithubCorpus(json: string): GithubCorpus {
  const raw: unknown = JSON.parse(json)
  const parsed = githubCorpusSchema.parse(raw)
  return {
    query: parsed.query,
    repos: parsed.repos.map((r) => ({
      fullName: r.fullName ?? r.name ?? '',
      url: r.url,
      stars: r.stars,
      description: r.description,
      topics: r.topics,
    })),
    capabilitySignals: parsed.capabilitySignals as Partial<Record<ScaffoldKind, number>>,
  }
}

const log = createLogger({ layer: 'core', source: 'scaffolder/github-corpus.ts' })

export interface GithubRepo {
  readonly fullName: string
  readonly url: string
  readonly stars: number
  readonly description: string
  readonly topics: readonly string[]
}

export interface GithubCorpus {
  readonly query: string
  readonly repos: GithubRepo[]
  readonly capabilitySignals: Readonly<Partial<Record<ScaffoldKind, number>>>
}

export type FetchJson = (url: string) => Promise<unknown>

const MAX_REPOS = 10
const FETCH_TIMEOUT_MS = 8000

/** fetch nativo com timeout + headers do GitHub. Lança em erro/timeout. */
async function defaultFetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-graph-flow' },
    })
    if (!res.ok) throw new McpGraphError(`github ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

interface SearchItem {
  full_name?: unknown
  html_url?: unknown
  stargazers_count?: unknown
  description?: unknown
  topics?: unknown
}

function toRepo(item: SearchItem): GithubRepo {
  return {
    fullName: typeof item.full_name === 'string' ? item.full_name : '',
    url: typeof item.html_url === 'string' ? item.html_url : '',
    stars: typeof item.stargazers_count === 'number' ? item.stargazers_count : 0,
    description: typeof item.description === 'string' ? item.description : '',
    topics: Array.isArray(item.topics) ? item.topics.filter((x): x is string => typeof x === 'string') : [],
  }
}

/** Sinais de capacidade a partir de nome+descrição+topics (mesmo método do brownfield). */
function repoSignals(repo: GithubRepo): Partial<Record<ScaffoldKind, number>> {
  const text = `${repo.fullName} ${repo.description} ${repo.topics.join(' ')}`.toLowerCase()
  const signals: Partial<Record<ScaffoldKind, number>> = {}
  for (const entry of SCAFFOLD_REGISTRY) {
    if (entry.keywords.some((kw) => text.includes(kw.toLowerCase()))) signals[entry.kind] = 1
  }
  return signals
}

/**
 * Varre o github por scaffolds/boilerplate da `query`. Retorna corpus vazio em
 * falha de rede (gracioso). Não cacheia — ver {@link cacheGithubCorpus}.
 */
export async function fetchGithubCorpus(query: string, deps: { fetchJson?: FetchJson } = {}): Promise<GithubCorpus> {
  const fetchJson = deps.fetchJson ?? defaultFetchJson
  const q = encodeURIComponent(`${query} boilerplate scaffold template`)
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${MAX_REPOS}`
  let items: SearchItem[] = []
  try {
    const json = (await fetchJson(url)) as { items?: unknown }
    if (Array.isArray(json.items)) items = json.items as SearchItem[]
  } catch (err) {
    log.warn('github-corpus:fetch-failed', { error: err instanceof Error ? err.message : String(err) })
    return { query, repos: [], capabilitySignals: {} }
  }
  const repos = items.map(toRepo).filter((r) => r.fullName.length > 0)
  const capabilitySignals: Partial<Record<ScaffoldKind, number>> = {}
  for (const repo of repos) {
    for (const [kind, n] of Object.entries(repoSignals(repo))) {
      capabilitySignals[kind as ScaffoldKind] = (capabilitySignals[kind as ScaffoldKind] ?? 0) + (n ?? 0)
    }
  }
  log.info('github-corpus:fetched', { query, repos: repos.length })
  return { query, repos, capabilitySignals }
}

/** Persiste o corpus varrido (determinístico/offline após a 1ª varredura). */
export function cacheGithubCorpus(store: SqliteStore, corpus: GithubCorpus): void {
  const db: Database.Database = store.getDb()
  const projectId = store.getProject()?.id ?? 'default'
  db.prepare(
    `INSERT OR REPLACE INTO github_corpus_cache (id, project_id, query, payload, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(`gh_${projectId}_${corpus.query}`, projectId, corpus.query, JSON.stringify(corpus), Date.now())
}

/**
 * Check cache for a previously fetched corpus. Returns cached result
 * or null if not found or expired (stale > 24h).
 */
export function getCachedGithubCorpus(store: SqliteStore, query: string): GithubCorpus | null {
  try {
    const db: Database.Database = store.getDb()
    const projectId = store.getProject()?.id ?? 'default'
    const row = db
      .prepare(
        'SELECT payload, fetched_at FROM github_corpus_cache WHERE query = ? AND project_id = ? ORDER BY fetched_at DESC LIMIT 1',
      )
      .get(query, projectId) as { payload: string; fetched_at: number } | undefined
    if (!row) return null

    const age = Date.now() - row.fetched_at
    const STALE_MS = 24 * 60 * 60 * 1000 // 24h
    if (age > STALE_MS) {
      log.debug('github-corpus:cache-stale', { query, ageMs: age })
      return null
    }

    const corpus = parseGithubCorpus(row.payload)
    log.info('github-corpus:cache-hit', { query, repos: corpus.repos.length, ageMs: age })
    return corpus
  } catch {
    return null
  }
}

/**
 * Fetch from GitHub only if not cached (or cache stale). Deterministic after
 * first fetch — cache hit = zero network calls.
 */
export async function fetchOrGetCachedCorpus(
  store: SqliteStore,
  query: string,
  deps: { fetchJson?: FetchJson } = {},
): Promise<GithubCorpus> {
  const cached = getCachedGithubCorpus(store, query)
  if (cached) return cached

  const corpus = await fetchGithubCorpus(query, deps)
  if (corpus.repos.length > 0) cacheGithubCorpus(store, corpus)
  return corpus
}

// Stopwords PT+EN — descartadas ao derivar a query (ruído sem valor de busca).
const STOPWORDS = new Set([
  'que',
  'com',
  'para',
  'por',
  'uma',
  'dos',
  'das',
  'como',
  'mais',
  'esta',
  'este',
  'seja',
  'sao',
  'são',
  'num',
  'numa',
  'pelo',
  'pela',
  'sem',
  'sua',
  'seu',
  'aos',
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'are',
  'should',
  'must',
  'crie',
  'criar',
  'fazer',
  'permita',
  'sistema',
  'app',
  'aplicacao',
  'aplicação',
])

/**
 * Query determinística p/ a busca github: top-N termos por frequência (sem
 * stopwords, ≥4 chars), desempate alfabético. Estável → mesma entrada, mesma query.
 */
export function deriveCorpusQuery(text: string, maxTerms = 6): string {
  const freq = new Map<string, number>()
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}-]{4,}/gu) ?? []) {
    if (STOPWORDS.has(raw)) continue
    freq.set(raw, (freq.get(raw) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms)
    .map((e) => e[0])
    .join(' ')
}

/**
 * Greenfield: varre o github por exemplos da `query` e cacheia (semente
 * determinística). Gracioso — falha de rede/corpus vazio não cacheia, nunca lança.
 */
export async function seedGreenfieldCorpus(
  store: SqliteStore,
  query: string,
  deps: { fetchJson?: FetchJson } = {},
): Promise<{ seeded: number }> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return { seeded: 0 }
  const corpus = await fetchGithubCorpus(trimmed, deps)
  if (corpus.repos.length > 0) cacheGithubCorpus(store, corpus)
  return { seeded: corpus.repos.length }
}

/** Agrega os sinais de TODOS os corpora github cacheados (greenfield enrichment). */
export function githubCorpusSignals(store: SqliteStore): Partial<Record<ScaffoldKind, number>> {
  const signals: Partial<Record<ScaffoldKind, number>> = {}
  try {
    const db: Database.Database = store.getDb()
    const projectId = store.getProject()?.id ?? 'default'
    const rows = db.prepare('SELECT payload FROM github_corpus_cache WHERE project_id = ?').all(projectId) as Array<{
      payload: string
    }>
    for (const row of rows) {
      try {
        const corpus = parseGithubCorpus(row.payload)
        for (const [kind, n] of Object.entries(corpus.capabilitySignals)) {
          signals[kind as ScaffoldKind] = (signals[kind as ScaffoldKind] ?? 0) + (n ?? 0)
        }
      } catch {
        /* payload corrompido — ignora */
      }
    }
  } catch {
    // Store parcial (ex.: mock de teste sem getDb) ou tabela ausente — sem sinais.
  }
  return signals
}
