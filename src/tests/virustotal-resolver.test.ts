/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, vi } from 'vitest'
import { resolveVtVerdict, type VtPorts } from '../core/upgrade/virustotal-resolver.js'
import type { VirusTotalResult } from '../schemas/scan-info.js'

const STATS: VirusTotalResult = { flagged: 0, total: 72, permalink: 'https://www.virustotal.com/gui/file/abc' }

function ports(over: Partial<VtPorts> = {}): VtPorts {
  return {
    queryByHash: vi.fn().mockResolvedValue(STATS),
    upload: vi.fn().mockResolvedValue('analysis-1'),
    poll: vi.fn().mockResolvedValue(STATS),
    ...over,
  }
}

describe('resolveVtVerdict', () => {
  it('returns the existing report when VT already knows the hash — no upload', async () => {
    const p = ports()
    const r = await resolveVtVerdict({ sha256: 'abc', filePath: '/x' }, p)
    expect(r).toEqual(STATS)
    expect(p.upload).not.toHaveBeenCalled()
  })

  it('uploads + polls when the hash is unknown to VT (404)', async () => {
    const uploaded: VirusTotalResult = { flagged: 2, total: 72, permalink: 'https://vt/def' }
    const p = ports({
      queryByHash: vi.fn().mockResolvedValue('not-found'),
      poll: vi.fn().mockResolvedValue(uploaded),
    })
    const r = await resolveVtVerdict({ sha256: 'def', filePath: '/bin/agf' }, p)
    expect(p.upload).toHaveBeenCalledWith('/bin/agf')
    expect(p.poll).toHaveBeenCalledWith('analysis-1')
    expect(r).toEqual(uploaded)
  })

  it('fails open (null) when the query throws — never crashes the scan', async () => {
    const p = ports({ queryByHash: vi.fn().mockRejectedValue(new Error('429 rate limit')) })
    expect(await resolveVtVerdict({ sha256: 'x', filePath: '/x' }, p)).toBeNull()
  })

  it('fails open (null) when the upload succeeds but the analysis never completes', async () => {
    const p = ports({
      queryByHash: vi.fn().mockResolvedValue('not-found'),
      poll: vi.fn().mockResolvedValue(null),
    })
    expect(await resolveVtVerdict({ sha256: 'x', filePath: '/x' }, p)).toBeNull()
  })
})
