/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { deriveCorpusQuery, seedGreenfieldCorpus, githubCorpusSignals } from '../core/scaffolder/github-corpus.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-seed')
  return store
}

const fakeItems = {
  items: [
    {
      full_name: 'acme/kanban-board',
      html_url: 'https://x/1',
      stargazers_count: 900,
      description: 'a kanban board with state machine columns',
      topics: ['kanban', 'state-machine'],
    },
    {
      full_name: 'foo/kanban-api',
      html_url: 'https://x/2',
      stargazers_count: 120,
      description: 'rest api for kanban',
      topics: ['api'],
    },
  ],
}

describe('deriveCorpusQuery', () => {
  it('é determinística e prioriza termos frequentes, sem stopwords', () => {
    const text = 'crie um kanban com colunas a fazer fazendo e feito; mover cards no kanban board'
    const q1 = deriveCorpusQuery(text)
    const q2 = deriveCorpusQuery(text)
    expect(q1).toBe(q2) // estável
    expect(q1).toContain('kanban') // termo mais frequente
    expect(q1.split(' ')).not.toContain('com') // stopword descartada
    expect(q1.split(' ').length).toBeLessThanOrEqual(6)
  })

  it('retorna string vazia para entrada sem termos úteis', () => {
    expect(deriveCorpusQuery('a um e')).toBe('')
  })
})

describe('seedGreenfieldCorpus (fake fetch, 0 rede)', () => {
  it('cacheia o corpus varrido e expõe sinais', async () => {
    const store = freshStore()
    const fetchJson = async (): Promise<unknown> => fakeItems
    const { seeded } = await seedGreenfieldCorpus(store, 'kanban board', { fetchJson })
    expect(seeded).toBe(2)
    const rows = store.getDb().prepare('SELECT COUNT(*) AS n FROM github_corpus_cache').get() as { n: number }
    expect(rows.n).toBe(1)
    expect(Object.keys(githubCorpusSignals(store)).length).toBeGreaterThan(0)
    store.close()
  })

  it('falha de rede degrada gracioso (seeded 0, não lança, nada cacheado)', async () => {
    const store = freshStore()
    const fetchJson = async (): Promise<unknown> => {
      throw new Error('network down')
    }
    const { seeded } = await seedGreenfieldCorpus(store, 'kanban', { fetchJson })
    expect(seeded).toBe(0)
    const rows = store.getDb().prepare('SELECT COUNT(*) AS n FROM github_corpus_cache').get() as { n: number }
    expect(rows.n).toBe(0)
    store.close()
  })

  it('query vazia não busca', async () => {
    const store = freshStore()
    let called = false
    const fetchJson = async (): Promise<unknown> => {
      called = true
      return fakeItems
    }
    const { seeded } = await seedGreenfieldCorpus(store, '   ', { fetchJson })
    expect(seeded).toBe(0)
    expect(called).toBe(false)
    store.close()
  })
})
