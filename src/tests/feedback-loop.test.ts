/*!
 * TDD: feedback-loop — record wrong predictions + search corrections (node_6c3741333176).
 *
 * AC1: Given a wrong prediction, When feedback-record runs, correction is persisted.
 * AC2: Given a query similar to a past error, When feedback-search runs, returns correction.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { createFeedbackStore, type FeedbackRecord } from '../core/learning/feedback-loop.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('AC1: correction is persisted after recordFeedback', () => {
  it('stores a feedback record and retrieves it', () => {
    const store = createFeedbackStore(makeDb())
    const record: FeedbackRecord = {
      query: 'How do I add a node to the graph?',
      wrongPrediction: 'Use graph.add()',
      correction: 'Use agf node add --title "..." command.',
      context: 'cli-usage',
    }
    store.record(record)
    const all = store.list()
    expect(all.length).toBe(1)
    expect(all[0].correction).toBe(record.correction)
    expect(all[0].query).toBe(record.query)
  })
})

describe('AC2: feedback-search returns past correction for similar query', () => {
  it('finds correction when query matches past error query', () => {
    const store = createFeedbackStore(makeDb())
    store.record({
      query: 'add node to graph',
      wrongPrediction: 'wrong method',
      correction: 'Use agf node add',
      context: 'cli',
    })
    const results = store.search('add node')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].correction).toContain('agf node add')
  })

  it('returns empty when no match found', () => {
    const store = createFeedbackStore(makeDb())
    store.record({
      query: 'add node to graph',
      wrongPrediction: 'wrong',
      correction: 'Correct answer',
      context: 'cli',
    })
    const results = store.search('completely unrelated quantum physics')
    expect(results).toHaveLength(0)
  })
})
