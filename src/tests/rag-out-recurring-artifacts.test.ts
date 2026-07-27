import { describe, it, expect } from 'vitest'
import { RECURRING_ARTIFACT_DESCRIPTORS, loadRecurringArtifactCorpus } from '../core/rag-out/recurring-artifacts.js'
import { loadDefaultScaffoldCorpus } from '../core/rag-out/scaffold-corpus.js'
import { decideScaffold } from '../core/rag-out/gate.js'

describe('RECURRING_ARTIFACT_DESCRIPTORS', () => {
  it('exports a non-empty array', () => {
    expect(RECURRING_ARTIFACT_DESCRIPTORS.length).toBeGreaterThanOrEqual(3)
  })

  it('each descriptor has required fields with non-empty arrays', () => {
    for (const d of RECURRING_ARTIFACT_DESCRIPTORS) {
      expect(d.id, `id missing on ${d.id}`).toBeTruthy()
      expect(d.goal, `goal missing on ${d.id}`).toBeTruthy()
      expect(d.fitTags.length, `fitTags empty on ${d.id}`).toBeGreaterThan(0)
      expect(d.slots.length, `slots empty on ${d.id}`).toBeGreaterThan(0)
      expect(d.noveltyFloor, `noveltyFloor missing on ${d.id}`).toBeGreaterThan(0)
    }
  })

  it('no code-language annotation — recurring artifacts are language-agnostic', () => {
    for (const d of RECURRING_ARTIFACT_DESCRIPTORS) {
      expect(d.language, `${d.id} should be language-agnostic`).toBeUndefined()
    }
  })

  it('prd-software descriptor has prd in fitTags and nome in slots', () => {
    const prd = RECURRING_ARTIFACT_DESCRIPTORS.find((d) => d.id === 'prd-software')
    expect(prd).toBeDefined()
    expect(prd!.fitTags).toContain('prd')
    expect(prd!.slots).toContain('nome')
    expect(prd!.slots).toContain('problema')
  })

  it('skill-lifecycle descriptor has skill in fitTags and skillName in slots', () => {
    const skill = RECURRING_ARTIFACT_DESCRIPTORS.find((d) => d.id === 'skill-lifecycle')
    expect(skill).toBeDefined()
    expect(skill!.fitTags).toContain('skill')
    expect(skill!.slots).toContain('skillName')
  })

  it('noveltyFloor values are in the [0.5, 0.8] conservative range', () => {
    for (const d of RECURRING_ARTIFACT_DESCRIPTORS) {
      expect(d.noveltyFloor).toBeGreaterThanOrEqual(0.5)
      expect(d.noveltyFloor).toBeLessThanOrEqual(0.8)
    }
  })
})

describe('loadRecurringArtifactCorpus', () => {
  it('returns the same entries as RECURRING_ARTIFACT_DESCRIPTORS', () => {
    expect(loadRecurringArtifactCorpus()).toEqual(RECURRING_ARTIFACT_DESCRIPTORS)
  })
})

describe('loadDefaultScaffoldCorpus — includes recurring artifacts', () => {
  it('contains both code scaffolds and document scaffolds', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const ids = corpus.map((d) => d.id)
    // code scaffolds
    expect(ids).toContain('contract')
    // document scaffolds
    expect(ids).toContain('prd-software')
    expect(ids).toContain('skill-lifecycle')
  })

  it('gate recovers prd-software for a PRD creation goal', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('PRD de produto de software com fases e métricas', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('prd-software')
  })

  it('gate recovers skill-lifecycle for a skill creation goal', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('criar um skill para a fase de implement do lifecycle do agente', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('skill-lifecycle')
  })

  it('gate still recovers contract for a REST endpoint goal (no regression)', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('build a REST endpoint handler with request validation', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('contract')
  })
})
