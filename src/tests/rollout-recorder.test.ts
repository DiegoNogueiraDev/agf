/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RolloutRecorder } from '../core/thread-store/rollout-recorder.js'

describe('RolloutRecorder', () => {
  let dir: string
  let recorder: RolloutRecorder

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rollout-recorder-test-'))
    recorder = new RolloutRecorder(dir, 'test-thread')
  })

  afterEach(async () => {
    if (recorder) {
      await recorder.shutdown()
    }
    rmSync(dir, { recursive: true, force: true })
  })

  describe('lifecycle', () => {
    it('starts and stops', async () => {
      await recorder.start()
      expect(recorder).toBeDefined()
    })
  })

  describe('append and flush', () => {
    it('appendItem queues items', async () => {
      await recorder.start()
      recorder.append({ kind: 'SessionMeta', data: { id: 'abc' }, timestamp: '2024-01-01T00:00:00Z' })

      const path = join(dir, 'sessions', 'rollout-test-thread.jsonl')
      expect(existsSync(path)).toBe(false)
    })

    it('flush writes to disk', async () => {
      await recorder.start()
      recorder.append({ kind: 'SessionMeta', data: { id: 'abc' }, timestamp: '2024-01-01T00:00:00Z' })
      await recorder.flush()

      const path = join(dir, 'sessions', 'rollout-test-thread.jsonl')
      expect(existsSync(path)).toBe(true)
      const lines = readFileSync(path, 'utf-8').trim().split('\n')
      expect(lines).toHaveLength(1)
      const parsed = JSON.parse(lines[0])
      expect(parsed.kind).toBe('SessionMeta')
      expect(parsed.data.id).toBe('abc')
    })

    it('multiple items', async () => {
      await recorder.start()
      recorder.append([
        { kind: 'SessionMeta', data: { id: 'abc' }, timestamp: '2024-01-01T00:00:00Z' },
        { kind: 'ResponseItem', data: { role: 'assistant' }, timestamp: '2024-01-01T00:00:01Z' },
        { kind: 'TurnContext', data: { turn: 1 }, timestamp: '2024-01-01T00:00:02Z' },
      ])
      await recorder.flush()

      const path = join(dir, 'sessions', 'rollout-test-thread.jsonl')
      const lines = readFileSync(path, 'utf-8').trim().split('\n')
      expect(lines).toHaveLength(3)
      expect(JSON.parse(lines[0]).data.id).toBe('abc')
      expect(JSON.parse(lines[1]).data.role).toBe('assistant')
      expect(JSON.parse(lines[2]).data.turn).toBe(1)
    })
  })

  describe('I/O recovery', () => {
    it('handles file errors gracefully', async () => {
      await recorder.start()
      recorder.append({ kind: 'SessionMeta', data: { id: 'abc' }, timestamp: '2024-01-01T00:00:00Z' })

      const path = join(dir, 'sessions', 'rollout-test-thread.jsonl')
      rmSync(dir, { recursive: true, force: true })

      await recorder.flush()
      const lines = readFileSync(path, 'utf-8').trim().split('\n')
      expect(lines).toHaveLength(1)
    })
  })

  describe('shutdown', () => {
    it('drains buffer before shutdown', async () => {
      await recorder.start()
      recorder.append({ kind: 'EventMsg', data: { event: 'test' }, timestamp: '2024-01-01T00:00:00Z' })
      await recorder.shutdown()

      const path = join(dir, 'sessions', 'rollout-test-thread.jsonl')
      const lines = readFileSync(path, 'utf-8').trim().split('\n')
      expect(lines).toHaveLength(1)
      expect(JSON.parse(lines[0]).data.event).toBe('test')
    })
  })

  describe('RolloutItem types', () => {
    it('preserves types through serialize/deserialize roundtrip', async () => {
      await recorder.start()

      const items: RolloutRecorder['RolloutItem'][] = [
        { kind: 'SessionMeta', data: { id: 'abc' }, timestamp: '2024-01-01T00:00:00Z' },
        { kind: 'ResponseItem', data: { role: 'assistant', content: 'hello' }, timestamp: '2024-01-01T00:00:01Z' },
        { kind: 'TurnContext', data: { turn: 1, input: 'hi' }, timestamp: '2024-01-01T00:00:02Z' },
        { kind: 'EventMsg', data: { type: 'info' }, timestamp: '2024-01-01T00:00:03Z' },
      ]
      recorder.append(items)
      await recorder.flush()

      const path = join(dir, 'sessions', 'rollout-test-thread.jsonl')
      const lines = readFileSync(path, 'utf-8').trim().split('\n')
      expect(lines).toHaveLength(4)
      const parsed = lines.map((l) => JSON.parse(l))
      expect(parsed[0].kind).toBe('SessionMeta')
      expect(parsed[0].data.id).toBe('abc')
      expect(parsed[1].kind).toBe('ResponseItem')
      expect(parsed[1].data.role).toBe('assistant')
      expect(parsed[2].kind).toBe('TurnContext')
      expect(parsed[2].data.turn).toBe(1)
      expect(parsed[3].kind).toBe('EventMsg')
      expect(parsed[3].data.type).toBe('info')
    })
  })
})
