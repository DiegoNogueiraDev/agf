/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { fetchGithubCorpus, cacheGithubCorpus, githubCorpusSignals } from '../../core/scaffolder/github-corpus.js'

// fetch FAKE (sem rede) — simula a resposta da API de busca do github.
const fakeFetch = async (): Promise<unknown> => ({
  items: [
    {
      full_name: 'acme/rest-api-boilerplate',
      html_url: 'https://x/1',
      stargazers_count: 999,
      description: 'rest endpoint handler with validation',
      topics: ['rest', 'api'],
    },
    {
      full_name: 'acme/xstate-machine',
      html_url: 'https://x/2',
      stargazers_count: 500,
      description: 'state machine reducer transitions',
      topics: ['state', 'fsm'],
    },
  ],
})

describe('github-corpus (greenfield) — varredura + cache determinístico', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('p')
  })
  afterEach(() => store.close())

  it('fetchGithubCorpus deriva sinais de capacidade dos repos', async () => {
    const corpus = await fetchGithubCorpus('typescript', { fetchJson: fakeFetch })
    expect(corpus.repos.length).toBe(2)
    expect(corpus.capabilitySignals['contract']).toBeGreaterThan(0) // rest/handler/api
    expect(corpus.capabilitySignals['state-machine']).toBeGreaterThan(0)
  })

  it('cache torna determinístico/offline: signals lidos do store', async () => {
    const corpus = await fetchGithubCorpus('ts', { fetchJson: fakeFetch })
    cacheGithubCorpus(store, corpus)
    const sig = githubCorpusSignals(store)
    expect(sig['contract']).toBeGreaterThan(0)
    expect(sig['state-machine']).toBeGreaterThan(0)
  })

  it('falha de rede → corpus vazio (gracioso, nunca lança)', async () => {
    const corpus = await fetchGithubCorpus('x', {
      fetchJson: async () => {
        throw new Error('network down')
      },
    })
    expect(corpus.repos).toEqual([])
    expect(corpus.capabilitySignals).toEqual({})
  })
})
