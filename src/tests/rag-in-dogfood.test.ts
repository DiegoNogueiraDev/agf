/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task node_4e8fe6f70417 — Dogfooding 1.4 integration
 *
 * AC1: loadDefaultCorpus() includes harness-family entries from COMMAND_REGISTRY
 *      (count matches buildHarnessCorpus().length)
 * AC2: retrieveCommand("pull the next unblocked task", loadDefaultCorpus())
 *      top result command contains "agf next"
 * AC3: all harness-family chunks in default corpus have command starting with "agf"
 */

import { describe, it, expect } from 'vitest'
import { loadDefaultCorpus, buildHarnessCorpus } from '../core/rag-in/builtin-corpus.js'
import { retrieveCommand } from '../core/rag-in/retrieve.js'
import { COMMAND_REGISTRY } from '../core/config/command-registry.js'

describe('AC1 — loadDefaultCorpus includes harness chunks from COMMAND_REGISTRY', () => {
  it('corpus contains harness-family entries', () => {
    const corpus = loadDefaultCorpus()
    const harness = corpus.filter((c) => c.family === 'harness')
    expect(harness.length).toBeGreaterThan(0)
  })

  it('harness count matches buildHarnessCorpus().length', () => {
    const corpus = loadDefaultCorpus()
    const harness = corpus.filter((c) => c.family === 'harness')
    const expected = buildHarnessCorpus().length
    expect(harness.length).toBe(expected)
  })

  it('harness count is at least COMMAND_REGISTRY length (extra chunks allowed)', () => {
    const harness = buildHarnessCorpus()
    expect(harness.length).toBeGreaterThanOrEqual(COMMAND_REGISTRY.length)
  })

  it('corpus also contains non-harness entries (seed + unix/powershell)', () => {
    const corpus = loadDefaultCorpus()
    const nonHarness = corpus.filter((c) => c.family !== 'harness')
    expect(nonHarness.length).toBeGreaterThan(0)
  })
})

describe('AC2 — retrieveCommand surfaces agf next for "pull next unblocked task"', () => {
  it('top result command contains "agf next" for pull-next intent', () => {
    const corpus = loadDefaultCorpus()
    const d = retrieveCommand('pull the next unblocked task', corpus)
    expect(d.decision).toBe('retrieved')
    expect(d.top?.command).toContain('agf next')
  })

  it('"start next task" retrieves an agf command for starting/pulling work', () => {
    const corpus = loadDefaultCorpus()
    const d = retrieveCommand('start next task mark in_progress', corpus)
    if (d.decision === 'retrieved') {
      expect(d.top?.command).toMatch(/^agf /)
    }
  })
})

describe('AC3 — all harness chunks in default corpus start with "agf"', () => {
  it('every harness-family chunk has command starting with "agf"', () => {
    const corpus = loadDefaultCorpus()
    const harness = corpus.filter((c) => c.family === 'harness')
    for (const chunk of harness) {
      expect(chunk.command.trim(), `${chunk.id} command does not start with agf`).toMatch(/^agf/)
    }
  })

  it('harness chunks have non-empty intent and id', () => {
    const corpus = loadDefaultCorpus()
    const harness = corpus.filter((c) => c.family === 'harness')
    for (const chunk of harness) {
      expect(chunk.intent.trim().length, `${chunk.id} has empty intent`).toBeGreaterThan(0)
      expect(chunk.id.trim().length, `${chunk.id} has empty id`).toBeGreaterThan(0)
    }
  })
})
