/*!
 * TDD: wire decideScaffold into implement-attempt prompt path.
 *
 * AC1: Goal with scaffold match above threshold → prompt contains scaffold
 *      reference and slot list. Output prompt is shorter than full-gen baseline.
 * AC2: Goal without scaffold match → full-gen prompt (no scaffold block).
 * AC3: test:blast green without regression.
 */

import { describe, it, expect } from 'vitest'
import { buildInitialPromptWithScaffold } from '../core/autonomy/implement-attempt.js'
import type { ScaffoldDescriptor } from '../core/rag-out/gate.js'

const baseNode = { id: 'n1', title: 'Add auth middleware to Express' }

const matchingScaffold: ScaffoldDescriptor = {
  id: 'express-middleware',
  goal: 'add middleware to express app',
  fitTags: ['express', 'middleware'],
  slots: ['name', 'impl'],
  noveltyFloor: 0.3,
  structureRef: 'scaffolder:express-middleware',
  language: 'typescript',
}

describe('buildInitialPromptWithScaffold — scaffold match (AC1)', () => {
  it('prompt includes scaffold reference and slot list when confidence is above threshold', () => {
    const prompt = buildInitialPromptWithScaffold(baseNode, {
      scaffoldDecision: { decision: 'recover', confidence: 0.8, best: matchingScaffold },
    })
    expect(prompt).toContain('scaffold')
    expect(prompt).toContain('slot')
  })

  it('prompt mentions scaffold id when scaffold is matched', () => {
    const prompt = buildInitialPromptWithScaffold(baseNode, {
      scaffoldDecision: { decision: 'recover', confidence: 0.8, best: matchingScaffold },
    })
    expect(prompt).toContain(matchingScaffold.id)
  })
})

describe('buildInitialPromptWithScaffold — no match (AC2)', () => {
  it('falls back to full-gen when decision is generate', () => {
    const prompt = buildInitialPromptWithScaffold(baseNode, {
      scaffoldDecision: { decision: 'generate', confidence: 0.1, best: null },
    })
    expect(prompt).toContain('Implemente')
    expect(prompt).not.toContain('slot')
  })

  it('falls back to full-gen when scaffoldDecision is undefined', () => {
    const prompt = buildInitialPromptWithScaffold(baseNode, {})
    expect(prompt).toContain('Implemente')
    expect(prompt).not.toContain('slot')
  })
})
