import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { HarnessWidget } from '../tui/components/HarnessWidget.js'

describe('HarnessWidget com barras coloridas', () => {
  it('renderiza score e grade', () => {
    const { lastFrame } = render(
      <HarnessWidget score={85} testScore={90} logScore={80} totalModules={10} darkModules={[]} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('85')
    expect(frame).toContain('A')
  })

  it('barra verde para score >= 80', () => {
    const { lastFrame } = render(
      <HarnessWidget score={85} testScore={90} logScore={80} totalModules={5} darkModules={[]} />,
    )
    expect(lastFrame() ?? '').toContain('90%')
  })

  it('barra amarela para score entre 50 e 79', () => {
    const { lastFrame } = render(
      <HarnessWidget score={65} testScore={60} logScore={50} totalModules={8} darkModules={[]} />,
    )
    expect(lastFrame() ?? '').toContain('60%')
  })

  it('barra vermelha para score < 50', () => {
    const { lastFrame } = render(
      <HarnessWidget score={30} testScore={20} logScore={40} totalModules={3} darkModules={[]} />,
    )
    expect(lastFrame() ?? '').toContain('20%')
  })

  it('mostra módulos sem cobertura', () => {
    const { lastFrame } = render(
      <HarnessWidget score={70} testScore={70} logScore={70} totalModules={10} darkModules={['auth', 'db']} />,
    )
    expect(lastFrame() ?? '').toContain('2 modulos sem cobertura')
  })
})
