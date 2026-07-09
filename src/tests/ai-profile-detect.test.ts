/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Onda 1A — `--ai` resolves the detected agent's output profile instead of
 * always falling back to `minimal`. The agent signal (detectAiFromEnv) was
 * previously detected and discarded; these tests pin the mapping + the
 * non-regression contract (unknown agent → minimal, byte-identical default).
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  resolveAgentProfile,
  setAi,
  setSelect,
  setProfile,
  setCurrentCommand,
  setDetectedAgent,
  writeEnvelope,
} from '../core/output/writer.js'
import type { OutputEnvelope } from '../core/output/envelope.js'

// ── Pure mapping: agent display name → ProfileName ──────────

describe('resolveAgentProfile', () => {
  it('maps Claude Code to the claude-code profile', () => {
    expect(resolveAgentProfile('Claude Code')).toBe('claude-code')
  })

  it('maps GitHub Copilot to the copilot profile', () => {
    expect(resolveAgentProfile('GitHub Copilot')).toBe('copilot')
  })

  it('maps OpenCode to the opencode profile', () => {
    expect(resolveAgentProfile('OpenCode')).toBe('opencode')
  })

  it('falls back to minimal for an agent without a dedicated profile', () => {
    expect(resolveAgentProfile('Cursor')).toBe('minimal')
  })

  it('falls back to minimal when no agent is detected', () => {
    expect(resolveAgentProfile(null)).toBe('minimal')
  })
})

// ── Integration: writeEnvelope honors the detected agent under --ai ──

/** Capture a single writeEnvelope JSON emission to stdout. */
function captureEnvelope(fn: () => void): Record<string, unknown> {
  const chunks: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  // @ts-expect-error — test shim narrows the overloaded signature
  process.stdout.write = (s: string) => {
    chunks.push(s)
    return true
  }
  try {
    fn()
  } finally {
    process.stdout.write = original
  }
  return JSON.parse(chunks.join('')) as Record<string, unknown>
}

/** Reset the writer singleton between cases. */
function resetWriter(): void {
  setAi(false)
  setSelect(null)
  setProfile(undefined)
  setDetectedAgent(null)
  setCurrentCommand('')
}

describe('writeEnvelope --ai with a detected agent', () => {
  afterEach(resetWriter)

  const nextEnvelope: OutputEnvelope = {
    ok: true,
    data: { node: { id: 'n1', title: 'T', status: 'in_progress', priority: 2, type: 'task' }, reason: 'pull' },
    meta: { command: 'next' },
  } as unknown as OutputEnvelope

  it('keeps claude-code fields (node.status) when Claude Code is detected', () => {
    setAi(true)
    setCurrentCommand('next')
    setDetectedAgent('Claude Code')
    const out = captureEnvelope(() => writeEnvelope(nextEnvelope))
    const node = (out.data as Record<string, Record<string, unknown>>).node
    expect(node.status).toBe('in_progress')
  })

  it('strips node.status under minimal when no agent is detected', () => {
    setAi(true)
    setCurrentCommand('next')
    setDetectedAgent(null)
    const out = captureEnvelope(() => writeEnvelope(nextEnvelope))
    const node = (out.data as Record<string, Record<string, unknown>>).node
    expect(node.status).toBeUndefined()
  })

  it('lets an explicit --profile win over the detected agent', () => {
    setAi(true)
    setCurrentCommand('next')
    setProfile('minimal')
    setDetectedAgent('Claude Code')
    const out = captureEnvelope(() => writeEnvelope(nextEnvelope))
    const node = (out.data as Record<string, Record<string, unknown>>).node
    expect(node.status).toBeUndefined()
  })
})
