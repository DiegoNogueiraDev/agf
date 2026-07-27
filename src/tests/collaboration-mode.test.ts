/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-collaboration-modes — Collaboration mode types, templates, and tool gating.
 */
import { describe, it, expect } from 'vitest'
import {
  getCollaborationTemplate,
  getBlockedTools,
  listModes,
  type CollaborationMode,
} from '../core/agent-driver/collaboration-mode.js'

describe('collaboration-mode: getCollaborationTemplate', () => {
  it('returns plan mode template', () => {
    const template = getCollaborationTemplate('plan')
    expect(template).toContain('PLAN MODE')
    expect(template).toContain('Do NOT modify files')
  })

  it('returns execute mode template', () => {
    const template = getCollaborationTemplate('execute')
    expect(template).toContain('EXECUTE MODE')
    expect(template).toContain('full access')
  })

  it('returns pair mode template', () => {
    const template = getCollaborationTemplate('pair')
    expect(template).toContain('PAIR PROGRAMMING MODE')
    expect(template).toContain('step by step')
  })

  it('returns default (execute) for unknown mode', () => {
    const template = getCollaborationTemplate('unknown' as CollaborationMode)
    expect(template).toContain('EXECUTE MODE')
  })
})

describe('collaboration-mode: getBlockedTools', () => {
  it('plan mode blocks mutation tools', () => {
    const blocked = getBlockedTools('plan')
    expect(blocked).toContain('write')
    expect(blocked).toContain('edit')
    expect(blocked).toContain('bash')
    expect(blocked).not.toContain('read')
    expect(blocked).not.toContain('grep')
  })

  it('execute mode blocks nothing', () => {
    const blocked = getBlockedTools('execute')
    expect(blocked.length).toBe(0)
  })

  it('pair mode blocks destructive tools', () => {
    const blocked = getBlockedTools('pair')
    expect(blocked).toContain('bash')
  })
})

describe('collaboration-mode: listModes', () => {
  it('returns all 3 modes', () => {
    const modes = listModes()
    expect(modes.length).toBe(3)
    expect(modes[0].id).toBe('plan')
    expect(modes[1].id).toBe('execute')
    expect(modes[2].id).toBe('pair')
  })

  it('each mode has id, label, and description', () => {
    for (const mode of listModes()) {
      expect(mode.id).toBeTruthy()
      expect(mode.label).toBeTruthy()
      expect(mode.description).toBeTruthy()
    }
  })
})

describe('collaboration-mode: template immutability', () => {
  it('produces deterministic template for same mode', () => {
    const t1 = getCollaborationTemplate('plan')
    const t2 = getCollaborationTemplate('plan')
    expect(t1).toBe(t2)
  })
})
