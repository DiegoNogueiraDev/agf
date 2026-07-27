/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/services/workspace-state.ts — RealWorkspaceStateService.
 */

import { describe, it, expect } from 'vitest'
import { RealWorkspaceStateService } from '../core/services/workspace-state.js'

describe('RealWorkspaceStateService', () => {
  it('snapshot() records tracked file count and is listable', () => {
    const svc = new RealWorkspaceStateService()
    svc.track('a.ts')
    svc.track('b.ts')
    const snap = svc.snapshot('before')

    expect(snap.label).toBe('before')
    expect(snap.fileCount).toBe(2)
    expect(svc.listSnapshots().map((s) => s.id)).toContain(snap.id)
  })

  it('restore() reports whether a snapshot exists', () => {
    const svc = new RealWorkspaceStateService()
    const snap = svc.snapshot('x')
    expect(svc.restore(snap.id)).toBe(true)
    expect(svc.restore('missing')).toBe(false)
  })

  it('revert() creates a new reverting snapshot, null for unknown id', () => {
    const svc = new RealWorkspaceStateService()
    const snap = svc.snapshot('x')
    const rev = svc.revert(snap.id)
    expect(rev?.label).toBe('revert-x')
    expect(svc.revert('missing')).toBeNull()
  })

  it('diff() returns null for an unknown from-snapshot', () => {
    const svc = new RealWorkspaceStateService()
    expect(svc.diff('nope')).toBeNull()
  })
})
