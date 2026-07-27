import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { FooterBar } from '../tui/components/FooterBar.js'
import { getContextualHelp } from '../tui/contextual-help.js'

describe('FooterBar with contextual help', () => {
  it('renderiza helpHint quando fornecido', () => {
    const { lastFrame } = render(<FooterBar helpHint="Grafo vazio. Use /wizard para começar" />)
    expect(lastFrame() ?? '').toContain('Grafo vazio')
    expect(lastFrame() ?? '').toContain('/wizard')
  })

  it('não renderiza hint quando vazio', () => {
    const { lastFrame } = render(<FooterBar />)
    const frame = lastFrame() ?? ''
    expect(frame).not.toContain('Grafo vazio')
  })

  it('renderiza hint junto com outros props', () => {
    const { lastFrame } = render(
      <FooterBar helpHint="Test help" harnessScore={85} harnessGrade="A" mode="EXECUTE" tokenEstimate={500} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Test help')
    expect(frame).toContain('A')
    expect(frame).toContain('EXECUTE')
  })
})

describe('getContextualHelp', () => {
  it('retorna hint para grafo vazio', () => {
    const hint = getContextualHelp({ totalNodes: 0, view: 'dashboard' })
    expect(hint).toContain('vazio')
  })

  it('retorna hint para view kanban sem nodes', () => {
    const hint = getContextualHelp({ totalNodes: 0, view: 'kanban' })
    expect(hint).toBeTruthy()
  })

  it('retorna null quando grafo populado', () => {
    const hint = getContextualHelp({ totalNodes: 10, view: 'dashboard' })
    expect(hint).toBeNull()
  })
})
