import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { HarnessWidget } from '../tui/components/HarnessWidget.js'

describe('HarnessWidget (TUI)', () => {
  it('renderiza score com grade', () => {
    const { lastFrame } = render(
      <HarnessWidget score={78} testScore={85} logScore={72} totalModules={42} darkModules={[]} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Harness')
    expect(frame).toContain('78')
    expect(frame).toContain('B')
    expect(frame).toContain('85')
    expect(frame).toContain('72')
    expect(frame).toContain('42')
  })

  it('renderiza grade A quando score >= 85', () => {
    const { lastFrame } = render(
      <HarnessWidget score={90} testScore={95} logScore={85} totalModules={10} darkModules={[]} />,
    )
    expect(lastFrame() ?? '').toContain('A')
  })

  it('renderiza grade D quando score < 55', () => {
    const { lastFrame } = render(
      <HarnessWidget score={40} testScore={30} logScore={50} totalModules={10} darkModules={['a.ts']} />,
    )
    expect(lastFrame() ?? '').toContain('D')
  })
})
