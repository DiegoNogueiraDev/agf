import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { DiffPanel, type DiffLineItem } from '../tui/components/DiffPanel.js'

describe('DiffPanel (TUI)', () => {
  it('renderiza header com contagem de arquivos', () => {
    const diffs: DiffLineItem[] = [
      { type: 'header', text: 'src/foo.ts' },
      { type: 'added', text: '+ const x = 1;' },
      { type: 'removed', text: '- const y = 2;' },
    ]
    const { lastFrame } = render(<DiffPanel diffs={diffs} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Diff')
    expect(frame).toContain('foo.ts')
    expect(frame).toContain('const x = 1')
    expect(frame).toContain('const y = 2')
  })

  it('mostra mensagem quando vazio', () => {
    const { lastFrame } = render(<DiffPanel diffs={[]} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Nenhuma edicao')
  })

  it('trunca quando muitos diffs (>20 linhas)', () => {
    const diffs: DiffLineItem[] = Array.from({ length: 30 }, (_, i) => ({
      type: 'added' as const,
      text: `+ line ${i}`,
    }))
    const { lastFrame } = render(<DiffPanel diffs={diffs} maxLines={20} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('10 linhas anteriores')
  })

  it('renderiza corretamente linhas add/remove/context', () => {
    const diffs: DiffLineItem[] = [
      { type: 'header', text: 'src/core/foo.ts' },
      { type: 'context', text: '  unchanged' },
      { type: 'added', text: '+ new line' },
      { type: 'removed', text: '- old line' },
    ]
    const { lastFrame } = render(<DiffPanel diffs={diffs} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('new line')
    expect(frame).toContain('old line')
    expect(frame).toContain('unchanged')
  })
})
