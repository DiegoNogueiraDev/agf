import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { ConfirmDialog } from '../tui/confirm-dialog.js'

describe('ConfirmDialog', () => {
  it('renderiza título', () => {
    const { lastFrame } = render(<ConfirmDialog title="DELETAR?" />)
    expect(lastFrame() ?? '').toContain('DELETAR?')
  })

  it('renderiza mensagem opcional', () => {
    const { lastFrame } = render(<ConfirmDialog title="DELETAR?" message="Node será removido permanentemente" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Node será removido')
  })

  it('renderiza instrução y/N', () => {
    const { lastFrame } = render(<ConfirmDialog title="DELETAR?" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('y')
    expect(frame).toContain('N')
    expect(frame).toContain('confirmar')
    expect(frame).toContain('cancelar')
  })

  it('funciona sem mensagem', () => {
    const { lastFrame } = render(<ConfirmDialog title="SAIR?" />)
    expect(lastFrame() ?? '').toContain('SAIR?')
  })
})
