/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for agent-aware output profiles (--profile flag).
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveProfile, PROFILE_NAMES } from '../core/output/profiles.js'
import { writeEnvelope, setProfile, setCurrentCommand, setSelect, setPretty } from '../core/output/writer.js'
import type { OutputEnvelope } from '../core/output/envelope.js'

const baseMeta = { command: 'next', ms: 3 }

function env<T>(data: T): OutputEnvelope<T> {
  return { ok: true, data, meta: { ...baseMeta } }
}

describe('resolveProfile', () => {
  it('returns null when no profile name is provided', () => {
    expect(resolveProfile(undefined, 'next')).toBeNull()
  })

  it('returns null for unknown profile name', () => {
    // @ts-expect-error testing invalid profile
    expect(resolveProfile('nonexistent', 'next')).toBeNull()
  })

  it('returns null when command has no profile entry', () => {
    const result = resolveProfile('claude-code', 'unknown-cmd')
    expect(result).toBeNull()
  })

  it('resolves claude-code profile for next command', () => {
    const result = resolveProfile('claude-code', 'next')
    expect(result).not.toBeNull()
    expect(result!.select).toContain('data.node.id')
    expect(result!.select).toContain('data.node.title')
    expect(result!.select).toContain('data.reason')
    expect(result!.compressed).toBe(false)
  })

  it('resolves claude-code profile for context with compressed=true', () => {
    const result = resolveProfile('claude-code', 'context')
    expect(result).not.toBeNull()
    expect(result!.compressed).toBe(true)
  })

  it('resolves copilot profile for next command', () => {
    const result = resolveProfile('copilot', 'next')
    expect(result).not.toBeNull()
    expect(result!.select).toContain('data.node.id')
    expect(result!.select).toContain('data.node.ac')
    expect(result!.select).toContain('data.node.description')
  })

  it('resolves minimal profile with fewer fields', () => {
    const minimal = resolveProfile('minimal', 'next')
    const claude = resolveProfile('claude-code', 'next')
    expect(minimal!.select!.length).toBeLessThan(claude!.select!.length)
  })

  it('PROFILE_NAMES contains all expected profiles', () => {
    expect(PROFILE_NAMES).toContain('claude-code')
    expect(PROFILE_NAMES).toContain('copilot')
    expect(PROFILE_NAMES).toContain('opencode')
    expect(PROFILE_NAMES).toContain('minimal')
  })
})

describe('writer --profile integration', () => {
  let buf = ''
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => {
    buf += String(s)
    return true
  })

  afterEach(() => {
    buf = ''
    setSelect(null)
    setProfile(undefined)
    setCurrentCommand('next')
    setPretty(false)
    spy.mockClear()
  })

  it('applies profile projection when no --select is set', () => {
    setProfile('minimal')
    setCurrentCommand('next')
    writeEnvelope(env({ node: { id: 'n1', title: 'T', description: 'long...' }, reason: 'r' }))
    const parsed = JSON.parse(buf)
    expect(parsed.data).toEqual({ node: { id: 'n1', title: 'T' } })
  })

  it('--select wins over --profile when both are provided', () => {
    setProfile('minimal')
    setSelect(['data.node.id'])
    setCurrentCommand('next')
    writeEnvelope(env({ node: { id: 'n1', title: 'T' }, reason: 'r' }))
    const parsed = JSON.parse(buf)
    // --select only projects id, minimal projects id+title
    expect(parsed.data).toEqual({ node: { id: 'n1' } })
  })

  it('writes full envelope when profile has no entry for current command', () => {
    setProfile('claude-code')
    setCurrentCommand('unknown-cmd')
    writeEnvelope(env({ a: 1, b: 2 }))
    const parsed = JSON.parse(buf)
    expect(parsed.data).toEqual({ a: 1, b: 2 })
  })

  it('gate profile projects an out-of-phase-advisory-wrapped design report (nested under report.data)', () => {
    setProfile('claude-code')
    setCurrentCommand('gate')
    writeEnvelope(
      env({
        phases: [
          {
            phase: 'design',
            report: {
              ok: true,
              mode: 'design_ready',
              advisory: true,
              phaseWarning: 'Results from design_ready are non-binding in phase IMPLEMENT',
              data: { ready: false, score: 50, grade: 'D', checks: [{ name: 'has_adrs', passed: false }] },
            },
          },
        ],
        anyFail: false,
      }),
    )
    const parsed = JSON.parse(buf)
    const phase = parsed.data.phases[0]
    expect(phase.phase).toBe('design')
    expect(phase.report.advisory).toBe(true)
    expect(phase.report.phaseWarning).toContain('non-binding')
    expect(phase.report.data.ready).toBe(false)
    expect(phase.report.data.score).toBe(50)
  })

  it('GIVEN agf gaps --json (minimal profile, --ai default) THEN output includes nodeId and evidence — not just kind/severity', () => {
    setProfile('minimal')
    setCurrentCommand('gaps')
    writeEnvelope(
      env({
        gaps: [
          {
            kind: 'phantom_done',
            severity: 'required',
            nodeId: 'node_abc123',
            evidence: 'Task node_abc123 is done but declares a missing test file',
          },
        ],
        ready: false,
      }),
    )
    const parsed = JSON.parse(buf)
    const gap = parsed.data.gaps[0]
    expect(gap.nodeId).toBe('node_abc123')
    expect(gap.evidence).toContain('missing test file')
  })
})
