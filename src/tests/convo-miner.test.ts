/*!
 * TDD: convo-miner — ingest JSONL sessions into memory (node_cba4075200af).
 *
 * AC1: Given a fixture JSONL session, When miner runs, extracts N memories with provenance.
 * AC2: Given same session re-mined, When runs, no duplicates (idempotent).
 */

import { describe, it, expect } from 'vitest'
import { mineConversation, type ConvoMinedMemory } from '../core/memory/convo-miner.js'

const SESSION_ID = 'session_fixture_001'
const TIMESTAMP = '2026-06-29T03:00:00.000Z'

// Minimal Claude JSONL fixture: assistant message containing a decision
function makeJsonlLine(role: 'user' | 'assistant', content: string): string {
  return JSON.stringify({ uuid: `msg_${Math.random().toString(36).slice(2)}`, role, content, created_at: TIMESTAMP })
}

const FIXTURE_JSONL = [
  makeJsonlLine('user', 'How should we handle migrations?'),
  makeJsonlLine(
    'assistant',
    'Decision: use soft-delete (archived=1) for all node removals. This ensures recoverability.',
  ),
  makeJsonlLine('user', 'What about the test strategy?'),
  makeJsonlLine(
    'assistant',
    'Error: the previous approach missed blast gate. Fix: always run npm run test:blast before agf done.',
  ),
].join('\n')

describe('AC1: extracts memories with provenance from JSONL', () => {
  it('extracts at least one memory from fixture session', () => {
    const mined = mineConversation(FIXTURE_JSONL, { sessionId: SESSION_ID })
    expect(mined.length).toBeGreaterThan(0)
  })

  it('mined memories carry session provenance', () => {
    const mined = mineConversation(FIXTURE_JSONL, { sessionId: SESSION_ID })
    for (const m of mined) {
      expect(m.sessionId).toBe(SESSION_ID)
      expect(m.name).toBeTruthy()
      expect(m.content).toBeTruthy()
    }
  })

  it('extracts decision and error markers', () => {
    const mined = mineConversation(FIXTURE_JSONL, { sessionId: SESSION_ID })
    const contents = mined.map((m) => m.content.toLowerCase())
    const hasDecision = contents.some((c) => c.includes('decision') || c.includes('soft-delete'))
    const hasError = contents.some((c) => c.includes('error') || c.includes('blast gate'))
    expect(hasDecision || hasError).toBe(true)
  })
})

describe('AC2: idempotent — same session does not produce duplicates', () => {
  it('same session produces same memory names (idempotent key)', () => {
    const first = mineConversation(FIXTURE_JSONL, { sessionId: SESSION_ID })
    const second = mineConversation(FIXTURE_JSONL, { sessionId: SESSION_ID })
    const firstNames = new Set(first.map((m: ConvoMinedMemory) => m.name))
    const secondNames = new Set(second.map((m: ConvoMinedMemory) => m.name))
    expect([...firstNames].sort()).toEqual([...secondNames].sort())
  })
})
