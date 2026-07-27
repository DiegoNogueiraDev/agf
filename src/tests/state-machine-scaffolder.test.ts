import { describe, it, expect } from 'vitest'
import { scaffoldStateMachine } from '../core/scaffolder/state-machine-scaffolder.js'
import type { StateMachineSpec } from '../core/scaffolder/state-machine-scaffolder.js'

const trafficLight: StateMachineSpec = {
  name: 'TrafficLight',
  states: ['red', 'yellow', 'green'],
  transitions: [
    { from: 'red', event: 'GO', to: 'green' },
    { from: 'green', event: 'SLOW', to: 'yellow' },
    { from: 'yellow', event: 'STOP', to: 'red' },
  ],
}

describe('scaffoldStateMachine', () => {
  it('returns a result with reducerFile and testFile', () => {
    const result = scaffoldStateMachine(trafficLight)
    expect(result.reducerFile).toBeDefined()
    expect(result.testFile).toBeDefined()
    expect(typeof result.reducerFile.path).toBe('string')
    expect(typeof result.reducerFile.content).toBe('string')
    expect(typeof result.testFile.content).toBe('string')
  })

  it('reducer file content includes machine name', () => {
    const result = scaffoldStateMachine(trafficLight)
    expect(result.reducerFile.content).toContain('TrafficLight')
  })

  it('reducer file includes all states', () => {
    const result = scaffoldStateMachine(trafficLight)
    expect(result.reducerFile.content).toContain('red')
    expect(result.reducerFile.content).toContain('yellow')
    expect(result.reducerFile.content).toContain('green')
  })

  it('reducer file includes all events', () => {
    const result = scaffoldStateMachine(trafficLight)
    expect(result.reducerFile.content).toContain('GO')
    expect(result.reducerFile.content).toContain('SLOW')
    expect(result.reducerFile.content).toContain('STOP')
  })

  it('diff shows added states', () => {
    const result = scaffoldStateMachine(trafficLight)
    expect(Array.isArray(result.diff.addedStates)).toBe(true)
  })

  it('uses custom reducerDir from options', () => {
    const result = scaffoldStateMachine(trafficLight, { reducerDir: 'src/reducers' })
    expect(result.reducerFile.path).toContain('src/reducers')
  })
})
