import { describe, it, expect } from 'vitest'
import { nextLifecycleAction, type LifecycleState } from '../core/orchestrator/lifecycle-pipeline.js'

const base: LifecycleState = {
  currentPhase: 'ANALYZE',
  hasPrd: false,
  hasAdrs: false,
  hasSprintPlan: false,
  tasksDoneRatio: 0,
  hasValidated: false,
  hasReviewed: false,
}

describe('LifecyclePipeline', () => {
  it('sem PRD -> import_prd', () => {
    const r = nextLifecycleAction({ ...base, hasPrd: false })
    expect(r.action).toBe('import_prd')
    expect(r.phase).toBe('ANALYZE')
  })

  it('com PRD, ANALYZE -> analyze_prd', () => {
    const r = nextLifecycleAction({ ...base, hasPrd: true, currentPhase: 'ANALYZE' })
    expect(r.action).toBe('analyze_prd')
  })

  it('com PRD+ADRs, DESIGN -> design_adrs', () => {
    const r = nextLifecycleAction({ ...base, hasPrd: true, hasAdrs: true, currentPhase: 'DESIGN' })
    expect(r.action).toBe('design_adrs')
  })

  it('com sprint plan, PLAN -> plan_sprint', () => {
    const r = nextLifecycleAction({ ...base, hasPrd: true, hasAdrs: true, hasSprintPlan: true, currentPhase: 'PLAN' })
    expect(r.action).toBe('plan_sprint')
  })

  it('tasks done < 80% -> implement', () => {
    const r = nextLifecycleAction({
      ...base,
      hasPrd: true,
      hasAdrs: true,
      hasSprintPlan: true,
      currentPhase: 'IMPLEMENT',
      tasksDoneRatio: 0.5,
    })
    expect(r.action).toBe('implement')
    expect(r.gate).toBe('validate_ready')
  })

  it('tasks done >= 80% sem validar -> validate', () => {
    const r = nextLifecycleAction({
      ...base,
      hasPrd: true,
      hasAdrs: true,
      hasSprintPlan: true,
      currentPhase: 'IMPLEMENT',
      tasksDoneRatio: 0.85,
    })
    expect(r.action).toBe('validate')
  })

  it('validado mas nao revisado -> review', () => {
    const r = nextLifecycleAction({
      ...base,
      hasPrd: true,
      hasAdrs: true,
      hasSprintPlan: true,
      currentPhase: 'VALIDATE',
      tasksDoneRatio: 0.9,
      hasValidated: true,
    })
    expect(r.action).toBe('review')
  })

  it('pipeline completa retorna done', () => {
    const r = nextLifecycleAction({
      ...base,
      hasPrd: true,
      hasAdrs: true,
      hasSprintPlan: true,
      currentPhase: 'LISTENING',
      tasksDoneRatio: 1,
      hasValidated: true,
      hasReviewed: true,
    })
    expect(r.action).toBe('done')
  })
})
