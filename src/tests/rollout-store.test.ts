/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RolloutStore, type RolloutEntry, type ResumeResult, listSessions } from '../schemas/rollout-store.schema.js'

describe('RolloutStore', () => {
  let dir: string
  let store: RolloutStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rollout-test-'))
    store = new RolloutStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('append / load events', () => {
    it('should store and load rollout entries', async () => {
      await store.append('session_1', { kind: 'user_message', content: 'hello' })
      await store.append('session_1', { kind: 'tool_call', toolName: 'read' })
      await store.append('session_1', { kind: 'tool_result', toolName: 'read' })

      const entries = await store.load('session_1')
      expect(entries).toHaveLength(3)
      expect(entries[0]?.kind).toBe('user_message')
      expect(entries[1]?.toolName).toBe('read')
    })

    it('should return empty array for unknown session', async () => {
      const entries = await store.load('nonexistent')
      expect(entries).toEqual([])
    })
  })

  describe('fork', () => {
    it('should fork with full history', async () => {
      await store.append('session_a', { kind: 'user_message', content: 'msg1' })
      await store.append('session_a', { kind: 'user_message', content: 'msg2' })

      const forkId = await store.fork('session_a', 'forked_session', 'full')
      const forkEntries = await store.load(forkId)
      expect(forkEntries).toHaveLength(2)
    })

    it('should fork with last N entries', async () => {
      for (let i = 0; i < 10; i++) {
        await store.append('session_b', { kind: 'user_message', content: `msg${i}` })
      }

      const forkId = await store.fork('session_b', 'forked_short', 'lastN', 3)
      const forkEntries = await store.load(forkId)
      expect(forkEntries).toHaveLength(3)
      expect(forkEntries[0]?.content).toBe('msg7')
      expect(forkEntries[2]?.content).toBe('msg9')
    })

    it('should create parent directory for new session', async () => {
      const forkId = await store.fork('session_parent', 'nested/forked', 'full')
      expect(forkId).toBe('nested/forked')
      const entries = await store.load(forkId)
      expect(entries).toEqual([])
    })
  })

  describe('listSessions', () => {
    it('should list available sessions', async () => {
      await store.append('session_one', { kind: 'user_message', content: 'a' })
      await store.append('session_two', { kind: 'user_message', content: 'b' })

      const sessions = await store.list()
      expect(sessions).toContain('session_one')
      expect(sessions).toContain('session_two')
    })
  })

  describe('integrity validation', () => {
    it('should validate integrity of valid rollout', async () => {
      await store.append('valid_session', { kind: 'user_message', content: 'ok' })
      const valid = await store.validate('valid_session')
      expect(valid.valid).toBe(true)
    })

    it('should detect corrupt files', async () => {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(join(dir, 'rollout-corrupt.ndjson'), 'not-json\n', 'utf-8')
      const result = await store.validate('corrupt')
      expect(result.valid).toBe(false)
    })
  })

  describe('resume', () => {
    it('should resume session (load all entries)', async () => {
      await store.append('resume_test', { kind: 'user_message', content: 'msg1' })
      await store.append('resume_test', { kind: 'tool_call', toolName: 'bash' })

      const result = await store.resume('resume_test')
      expect(result).not.toBeNull()
      expect(result!.entries).toHaveLength(2)
      expect(result!.sessionId).toBe('resume_test')
    })

    it('should return null for nonexistent session', async () => {
      const result = await store.resume('ghost')
      expect(result).toBeNull()
    })
  })
})
