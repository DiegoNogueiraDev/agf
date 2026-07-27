/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  applySection,
  generateClaudeMdSection,
  MARKER_START,
  MARKER_END,
  LEGACY_MARKER_START,
  LEGACY_MARKER_END,
} from '../core/config/ai-memory-generator.js'

describe('applySection — legacy marker migration + idempotency', () => {
  const section = generateClaudeMdSection('demo', 'lean')

  it('migrates a legacy mcp-graph block to agent-graph-flow markers (no duplication)', () => {
    const legacy = `# Project\n\n${LEGACY_MARKER_START}\n## old mcp content\nstart_task / finish_task\n${LEGACY_MARKER_END}\n\n## Hand-written tail\n`
    const result = applySection(legacy, section)

    // Old markers gone, new markers present, hand-written content preserved.
    expect(result).not.toContain(LEGACY_MARKER_START)
    expect(result).not.toContain(LEGACY_MARKER_END)
    expect(result).not.toContain('old mcp content')
    expect(result).toContain(MARKER_START)
    expect(result).toContain(MARKER_END)
    expect(result).toContain('# Project')
    expect(result).toContain('## Hand-written tail')

    // Exactly one managed section (no duplication).
    expect(result.split(MARKER_START).length - 1).toBe(1)
  })

  it('is idempotent — applying twice yields the same content', () => {
    const once = applySection('# Top\n', section)
    const twice = applySection(once, section)
    expect(twice).toBe(once)
  })

  it('replaces an existing agent-graph-flow section in place', () => {
    const withOld = applySection('# Top\n', generateClaudeMdSection('demo', 'ultra-lean'))
    const replaced = applySection(withOld, section)
    expect(replaced.split(MARKER_START).length - 1).toBe(1)
    expect(replaced).toContain('# Top')
  })

  it('appends a fresh section when none exists', () => {
    const result = applySection('# Just a heading\n', section)
    expect(result).toContain('# Just a heading')
    expect(result).toContain(MARKER_START)
  })
})
