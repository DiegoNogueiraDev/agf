import { describe, it, expect } from 'vitest'
import { classifyText, classifySectionTitle, isMetadataLine, isStructuralHeading } from '../core/parser/classify.js'

describe('classifyText', () => {
  it('returns an object with type and confidence', () => {
    const result = classifyText('some text')
    expect(typeof result.type).toBe('string')
    expect(typeof result.confidence).toBe('number')
  })

  it('confidence is between 0 and 1', () => {
    const result = classifyText('## Section heading with lots of content')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('handles empty string', () => {
    const result = classifyText('')
    expect(typeof result.type).toBe('string')
  })

  it('classifies acceptance criteria text', () => {
    const result = classifyText('GIVEN user is logged in WHEN they click submit THEN form is submitted')
    expect(typeof result.type).toBe('string')
    expect(result.confidence).toBeGreaterThan(0)
  })
})

describe('isMetadataLine', () => {
  it('returns boolean', () => {
    expect(typeof isMetadataLine('Status: done')).toBe('boolean')
  })

  it('returns true for **Priority: ... metadata lines', () => {
    expect(isMetadataLine('**Priority: High**')).toBe(true)
  })

  it('returns false for regular text', () => {
    expect(isMetadataLine('This is a normal sentence')).toBe(false)
  })
})

describe('isStructuralHeading', () => {
  it('returns boolean', () => {
    expect(typeof isStructuralHeading('Acceptance Criteria')).toBe('boolean')
  })

  it('returns true for scaffolding headings like Roadmap', () => {
    expect(isStructuralHeading('Roadmap da solução')).toBe(true)
  })

  it('returns false for implementable task headings', () => {
    expect(isStructuralHeading('some random title')).toBe(false)
  })
})

// node_553378a0c155 — um heading EXPLÍCITO de task ("Task:"/"Tarefa:") deve vencer
// uma menção incidental de "risk"/"bug" no próprio título. Antes, RISK_PATTERNS era
// testado antes de isExplicitTaskHeading → "Task: X (risk, check)" virava type=risk.
describe('classifySectionTitle — explicit task heading wins over incidental keyword', () => {
  it('classifies "Task: X (risk, check)" as task, not risk', () => {
    expect(classifySectionTitle('Task: X (risk, check)', 3).type).toBe('task')
  })

  it('classifies "Tarefa: mitigar o risco de N" as task, not risk', () => {
    expect(classifySectionTitle('Tarefa: mitigar o risco de N', 3).type).toBe('task')
  })

  it('still classifies a real risk heading as risk', () => {
    // "Risco de perda de dados" casa \brisco\b (a fixture DEVE bater o padrão real,
    // senão o teste não guarda nada — "Riscos"/"mitigações" não casam RISK_PATTERNS).
    expect(classifySectionTitle('Risco de perda de dados', 3).type).toBe('risk')
  })

  it('still classifies a real acceptance-criteria heading as acceptance_criteria', () => {
    expect(classifySectionTitle('Acceptance Criteria', 3).type).toBe('acceptance_criteria')
  })
})
