/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Daemon Self-Healing — persistent learning + proactive healing
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, unlinkSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DaemonSelfHealer } from '../core/daemon/daemon-self-healing.js'

describe('DaemonSelfHealer — persistent learning', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sh-test-'))
  })

  afterEach(() => {
    const learnFile = join(tmpDir, 'learnings.json')
    if (existsSync(learnFile)) unlinkSync(learnFile)
  })

  it('saves learnings to a file path', () => {
    const healer = new DaemonSelfHealer(tmpDir)
    healer.recordSuccess({ pattern: 'EADDRINUSE', fix: 'remove stale IPC', action: 'restart' })
    healer.persistLearnings()

    const learnFile = join(tmpDir, 'learnings.json')
    expect(existsSync(learnFile)).toBe(true)
    const data = JSON.parse(readFileSync(learnFile, 'utf-8'))
    expect(data).toHaveLength(1)
    expect(data[0].pattern).toBe('EADDRINUSE')
  })

  it('loads learnings from file on construction', () => {
    const learnFile = join(tmpDir, 'learnings.json')
    writeFileSync(learnFile, JSON.stringify([{ pattern: 'ECONNREFUSED', fix: 'check proxy', action: 'reconfigure' }]))

    const healer = new DaemonSelfHealer(tmpDir)
    expect(healer.getLearnedFixes()).toHaveLength(1)
    expect(healer.getLearnedFixes()[0].pattern).toBe('ECONNREFUSED')
  })

  it('accumulates learning across multiple saves', () => {
    const healer = new DaemonSelfHealer(tmpDir)
    healer.recordSuccess({ pattern: 'EADDRINUSE', fix: 'remove stale IPC', action: 'restart' })
    healer.recordSuccess({ pattern: 'ECONNRESET', fix: 'retry', action: 'retry' })
    healer.persistLearnings()

    const data = JSON.parse(readFileSync(join(tmpDir, 'learnings.json'), 'utf-8'))
    expect(data).toHaveLength(2)
  })

  it('survives with empty state when no learnings file exists', () => {
    const healer = new DaemonSelfHealer(tmpDir)
    expect(healer.getLearnedFixes()).toEqual([])
  })

  it('proactively returns applicable fixes for known frequent failures', () => {
    const healer = new DaemonSelfHealer(tmpDir)
    healer.recordSuccess({ pattern: 'EADDRINUSE', fix: 'remove stale IPC', action: 'restart' })
    healer.recordSuccess({ pattern: 'EADDRINUSE', fix: 'remove stale IPC', action: 'restart' })

    const proactive = healer.getProactiveFixes()
    const addrInUse = proactive.find((p) => p.pattern === 'EADDRINUSE')
    expect(addrInUse).toBeDefined()
    expect(addrInUse!.count).toBe(2)
  })

  it('only returns proactive fixes for patterns with 2+ occurrences', () => {
    const healer = new DaemonSelfHealer(tmpDir)
    healer.recordSuccess({ pattern: 'EADDRINUSE', fix: 'remove stale IPC', action: 'restart' })

    const proactive = healer.getProactiveFixes()
    expect(proactive.some((p) => p.pattern === 'EADDRINUSE')).toBe(false)
  })
})
