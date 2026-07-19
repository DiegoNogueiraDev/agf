import { describe, it, expect } from 'vitest'
import { parseImplementationPlan } from '../core/autonomy/plan-parser.js'
import { ExecutorError } from '../core/autonomy/implementation-executor.js'

describe('parseImplementationPlan — texto do modelo → plano estruturado', () => {
  it('extrai um bloco ```json com prosa ao redor', () => {
    const text = [
      'Claro! Aqui está a implementação:',
      '```json',
      JSON.stringify({ files: [{ path: 'src/a.ts', content: 'export const a = 1;' }], testCommand: 'npm test' }),
      '```',
      'Pronto.',
    ].join('\n')
    const plan = parseImplementationPlan(text)
    expect(plan.files).toHaveLength(1)
    expect(plan.files![0].path).toBe('src/a.ts')
    expect(plan.testCommand).toBe('npm test')
  })

  it('aceita JSON cru sem fence', () => {
    const text = JSON.stringify({ files: [{ path: 'x.ts', content: '//' }] })
    const plan = parseImplementationPlan(text)
    expect(plan.files![0].path).toBe('x.ts')
    expect(plan.testCommand).toBeUndefined()
  })

  it('lança ExecutorError quando não há JSON', () => {
    expect(() => parseImplementationPlan('desculpe, não sei')).toThrow(ExecutorError)
  })

  it('lança ExecutorError quando o shape é inválido (nem files nem edits)', () => {
    expect(() => parseImplementationPlan('```json\n{"foo":1}\n```')).toThrow(ExecutorError)
  })

  it('lança ExecutorError quando um file não tem content', () => {
    expect(() => parseImplementationPlan('{"files":[{"path":"a.ts"}]}')).toThrow(ExecutorError)
  })

  it('parseia plano só com edits (sem files)', () => {
    const text = JSON.stringify({ edits: [{ path: 'a.ts', oldString: 'x', newString: 'y' }] })
    const plan = parseImplementationPlan(text)
    expect(plan.edits).toHaveLength(1)
    expect(plan.edits![0]).toMatchObject({ path: 'a.ts', oldString: 'x', newString: 'y' })
    expect(plan.files).toBeUndefined()
  })

  it('parseia plano misto (files + edits)', () => {
    const text = JSON.stringify({
      files: [{ path: 'n.ts', content: '//' }],
      edits: [{ path: 'a.ts', oldString: 'x', newString: 'y', replaceAll: true }],
    })
    const plan = parseImplementationPlan(text)
    expect(plan.files).toHaveLength(1)
    expect(plan.edits).toHaveLength(1)
    expect(plan.edits![0].replaceAll).toBe(true)
  })

  it('aceita edit com oldString vazio (criação)', () => {
    const text = JSON.stringify({ edits: [{ path: 'a.ts', oldString: '', newString: 'novo' }] })
    expect(() => parseImplementationPlan(text)).not.toThrow()
  })

  it('lança ExecutorError quando um edit não tem newString', () => {
    expect(() => parseImplementationPlan('{"edits":[{"path":"a.ts","oldString":"x"}]}')).toThrow(ExecutorError)
  })

  it('lança ExecutorError quando files e edits estão ambos vazios/ausentes', () => {
    expect(() => parseImplementationPlan('{"files":[],"edits":[]}')).toThrow(ExecutorError)
  })
})
