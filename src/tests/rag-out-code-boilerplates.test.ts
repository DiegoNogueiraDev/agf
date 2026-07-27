import { describe, it, expect } from 'vitest'
import { CODE_BOILERPLATE_DESCRIPTORS, loadCodeBoilerplateCorpus } from '../core/rag-out/code-boilerplates.js'
import { loadDefaultScaffoldCorpus } from '../core/rag-out/scaffold-corpus.js'
import { decideScaffold } from '../core/rag-out/gate.js'

describe('CODE_BOILERPLATE_DESCRIPTORS', () => {
  it('exports at least 3 entries', () => {
    expect(CODE_BOILERPLATE_DESCRIPTORS.length).toBeGreaterThanOrEqual(3)
  })

  it('each descriptor has required fields with non-empty arrays', () => {
    for (const d of CODE_BOILERPLATE_DESCRIPTORS) {
      expect(d.id, `id missing on ${d.id}`).toBeTruthy()
      expect(d.goal, `goal missing on ${d.id}`).toBeTruthy()
      expect(d.fitTags.length, `fitTags empty on ${d.id}`).toBeGreaterThan(0)
      expect(d.slots.length, `slots empty on ${d.id}`).toBeGreaterThan(0)
      expect(d.noveltyFloor, `noveltyFloor missing on ${d.id}`).toBeGreaterThan(0)
    }
  })

  it('all code boilerplates carry a language annotation', () => {
    for (const d of CODE_BOILERPLATE_DESCRIPTORS) {
      expect(d.language, `${d.id} must declare a language`).toBeDefined()
    }
  })

  it('cli-ts descriptor targets typescript and has projectName in slots', () => {
    const d = CODE_BOILERPLATE_DESCRIPTORS.find((b) => b.id === 'cli-ts')
    expect(d).toBeDefined()
    expect(d!.language).toBe('typescript')
    expect(d!.fitTags).toContain('cli')
    expect(d!.slots).toContain('projectName')
  })

  it('fastapi-project descriptor targets python and has routes[] in slots', () => {
    const d = CODE_BOILERPLATE_DESCRIPTORS.find((b) => b.id === 'fastapi-project')
    expect(d).toBeDefined()
    expect(d!.language).toBe('python')
    expect(d!.fitTags).toContain('fastapi')
    expect(d!.slots).toContain('routes[]')
  })

  it('react-component descriptor targets typescript and has componentName in slots', () => {
    const d = CODE_BOILERPLATE_DESCRIPTORS.find((b) => b.id === 'react-component')
    expect(d).toBeDefined()
    expect(d!.language).toBe('typescript')
    expect(d!.fitTags).toContain('react')
    expect(d!.slots).toContain('componentName')
  })

  it('noveltyFloor values are in the conservative [0.5, 0.8] range', () => {
    for (const d of CODE_BOILERPLATE_DESCRIPTORS) {
      expect(d.noveltyFloor).toBeGreaterThanOrEqual(0.5)
      expect(d.noveltyFloor).toBeLessThanOrEqual(0.8)
    }
  })
})

describe('loadCodeBoilerplateCorpus', () => {
  it('returns same entries as CODE_BOILERPLATE_DESCRIPTORS', () => {
    expect(loadCodeBoilerplateCorpus()).toEqual(CODE_BOILERPLATE_DESCRIPTORS)
  })
})

describe('loadDefaultScaffoldCorpus — includes code boilerplates', () => {
  it('contains cli-ts, fastapi-project, and react-component', () => {
    const ids = loadDefaultScaffoldCorpus().map((d) => d.id)
    expect(ids).toContain('cli-ts')
    expect(ids).toContain('fastapi-project')
    expect(ids).toContain('react-component')
  })

  it('gate recovers cli-ts for a CLI TypeScript project goal', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('estrutura de projeto CLI em TypeScript com Commander e Vitest', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('cli-ts')
  })

  it('gate recovers fastapi-project for a FastAPI project goal', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('projeto FastAPI com rotas e modelos Pydantic', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('fastapi-project')
  })

  it('gate recovers react-component for a React component goal', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('componente React com props e hooks TypeScript', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('react-component')
  })

  it('language guard blocks cli-ts recovery for a python project', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('estrutura de projeto CLI em TypeScript com Commander e Vitest', corpus, {
      projectLanguage: 'python',
    })
    // cli-ts is typescript — language mismatch → must not recover it
    if (d.decision === 'recover') {
      expect(d.best?.id).not.toBe('cli-ts')
    }
  })

  it('no regression — contract scaffold still recovers for REST endpoint goal', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('build a REST endpoint handler with request validation', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('contract')
  })
})
