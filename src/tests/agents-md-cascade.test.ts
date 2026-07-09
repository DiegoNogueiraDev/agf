/*!
 * TDD: AGENTS.md hierarchical cascade — root→subdir, nearest-wins (node_b67971425c6e).
 *
 * AC1: Given AGENTS.md in subdir AND root, When resolved, subdir content extends/overrides root.
 * AC2: Given only root AGENTS.md, When resolved, current behavior preserved (root content returned).
 */

import { describe, it, expect } from 'vitest'
import { mergeAgentsMd, type AgentsMdLayer } from '../core/config/agents-md-cascade.js'

describe('AC1: subdir extends and overrides root (nearest-wins)', () => {
  it('appends subdir content after root content', () => {
    const layers: AgentsMdLayer[] = [
      { path: '/root/AGENTS.md', content: '# Root instructions\nUse agf commands.' },
      { path: '/root/src/AGENTS.md', content: '# Src overrides\nPrefer TypeScript.' },
    ]
    const merged = mergeAgentsMd(layers)
    expect(merged).toContain('Root instructions')
    expect(merged).toContain('Src overrides')
  })

  it('nearest layer appears last (wins on conflict)', () => {
    const layers: AgentsMdLayer[] = [
      { path: '/root/AGENTS.md', content: 'style: verbose' },
      { path: '/root/src/AGENTS.md', content: 'style: terse' },
    ]
    const merged = mergeAgentsMd(layers)
    const verboseIdx = merged.indexOf('style: verbose')
    const terseIdx = merged.indexOf('style: terse')
    expect(terseIdx).toBeGreaterThan(verboseIdx)
  })
})

describe('AC2: only root — behavior preserved', () => {
  it('returns root content unchanged when only one layer', () => {
    const layers: AgentsMdLayer[] = [{ path: '/root/AGENTS.md', content: '# Root only\nDo things correctly.' }]
    const merged = mergeAgentsMd(layers)
    expect(merged).toContain('# Root only')
    expect(merged).toContain('Do things correctly.')
  })

  it('returns empty string when no layers', () => {
    expect(mergeAgentsMd([])).toBe('')
  })
})
