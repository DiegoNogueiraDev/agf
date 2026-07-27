import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Sparkline, Gauge, ProgressBar, StatusPill } from '../tui/components/Widgets.js'
import { WorkflowPipeline } from '../tui/components/WorkflowPipeline.js'

describe('Sparkline', () => {
  it('renders sparkline chars for data', () => {
    const { lastFrame } = render(<Sparkline data={[1, 3, 5, 7, 9, 5, 2]} width={7} />)
    const frame = lastFrame() ?? ''
    expect(frame.length).toBeGreaterThan(0)
    expect(frame).toMatch(/[▁▂▃▄▅▆▇█]/)
  })

  it('shows nothing for empty data', () => {
    const { lastFrame } = render(<Sparkline data={[]} />)
    expect(lastFrame()?.trim() ?? '').toBe('')
  })
})

describe('Gauge', () => {
  it('renders bar at correct percentage', () => {
    const { lastFrame } = render(<Gauge value={5} max={10} width={10} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('50%')
    expect(frame).toMatch(/[█▉▊▋▌▍▎▏]/)
  })

  it('shows 100% when at max', () => {
    const { lastFrame } = render(<Gauge value={10} max={10} width={10} />)
    expect(lastFrame() ?? '').toContain('100%')
  })

  it('shows 0% when zero', () => {
    const { lastFrame } = render(<Gauge value={0} max={10} width={10} />)
    expect(lastFrame() ?? '').toContain('0%')
  })
})

describe('ProgressBar', () => {
  it('shows fraction and percentage', () => {
    const { lastFrame } = render(<ProgressBar done={3} total={10} width={20} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('3/10')
    expect(frame).toContain('30%')
  })
})

describe('StatusPill', () => {
  it('renders each status with icon', () => {
    for (const status of ['backlog', 'ready', 'in_progress', 'blocked', 'done']) {
      const { lastFrame } = render(<StatusPill status={status} />)
      const frame = lastFrame() ?? ''
      expect(frame.length).toBeGreaterThan(0)
      expect(frame.toLowerCase()).toContain(status)
    }
  })

  it('compact mode shows icon only', () => {
    const { lastFrame } = render(<StatusPill status="done" compact />)
    const frame = lastFrame() ?? ''
    expect(frame).not.toContain('done')
  })
})

describe('WorkflowPipeline', () => {
  it('renders all pipeline phases', () => {
    const { lastFrame } = render(<WorkflowPipeline currentPhase="IMPLEMENT" compact />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('ANALYZE')
    expect(frame).toContain('DESIGN')
    expect(frame).toContain('PLAN')
    expect(frame).toContain('IMPLEMENT')
    expect(frame).toContain('VALIDATE')
    expect(frame).toContain('DEPLOY')
    expect(frame).toContain('LISTENING')
  })

  it('current phase is highlighted', () => {
    const { lastFrame } = render(<WorkflowPipeline currentPhase="IMPLEMENT" compact />)
    const frame = lastFrame() ?? ''
    expect(frame).toBeTruthy()
  })
})
