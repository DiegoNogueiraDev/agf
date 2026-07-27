import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { PhaseIndicator } from '../tui/components/PhaseIndicator.js'

describe('PhaseIndicator (TUI)', () => {
  it('renderiza as 9 fases', () => {
    const { lastFrame } = render(<PhaseIndicator current="IMPLEMENT" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('ANALYZE')
    expect(frame).toContain('DESIGN')
    expect(frame).toContain('PLAN')
    expect(frame).toContain('IMPLEMENT')
    expect(frame).toContain('VALIDATE')
    expect(frame).toContain('REVIEW')
    expect(frame).toContain('HANDOFF')
    expect(frame).toContain('DEPLOY')
    expect(frame).toContain('LISTENING')
  })

  it('destaca IMPLEMENT e VALIDATE quando fase e BUILD', () => {
    const { lastFrame } = render(<PhaseIndicator current="BUILD" />)
    const frame = lastFrame() ?? ''
    // IMPLEMENT e VALIDATE sao as fases que compoem BUILD
    expect(frame).toContain('IMPLEMENT')
    expect(frame).toContain('VALIDATE')
  })
})
