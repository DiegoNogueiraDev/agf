import { describe, it, expect } from 'vitest'
import { WorkflowPipeline, PhaseGateMap } from '../tui/components/WorkflowPipeline.js'

describe('WorkflowPipeline', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof WorkflowPipeline).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(WorkflowPipeline.name).toBeTruthy()
  })
})

describe('PhaseGateMap', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof PhaseGateMap).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(PhaseGateMap.name).toBeTruthy()
  })
})
