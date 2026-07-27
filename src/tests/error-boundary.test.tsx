import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Box, Text } from 'ink'
import { ErrorBoundary, type ErrorBoundaryProps } from '../tui/error-boundary.js'

const Bomber = ({ shouldThrow, message }: { shouldThrow?: boolean; message?: string }): React.ReactElement => {
  if (shouldThrow) throw new Error(message ?? 'boom')
  return <Text>safe</Text>
}

describe('ErrorBoundary (Ink)', () => {
  it('renderiza children quando não há erro', () => {
    const { lastFrame } = render(
      <ErrorBoundary fallback={<Text>deu ruim</Text>}>
        <Text>ok</Text>
      </ErrorBoundary>,
    )
    expect(lastFrame() ?? '').toContain('ok')
  })

  it('renderiza fallback quando child lança erro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { lastFrame } = render(
      <ErrorBoundary fallback={<Text>deu ruim</Text>}>
        <Bomber shouldThrow />
      </ErrorBoundary>,
    )
    expect(lastFrame() ?? '').toContain('deu ruim')
    vi.restoreAllMocks()
  })

  it('fallback padrão exibe mensagem de erro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { lastFrame } = render(
      <ErrorBoundary>
        <Bomber shouldThrow message="crashou" />
      </ErrorBoundary>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('crashou')
    vi.restoreAllMocks()
  })

  it('fallback padrão exibe fallback sem mensagem quando erro não tem message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { lastFrame } = render(
      <ErrorBoundary>
        <Bomber shouldThrow message="" />
      </ErrorBoundary>,
    )
    expect(lastFrame() ?? '').toContain('Algo deu errado')
    vi.restoreAllMocks()
  })

  it('não afeta siblings quando um componente quebra', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { lastFrame } = render(
      <Box flexDirection="column">
        <Text>header</Text>
        <ErrorBoundary fallback={<Text>falhou</Text>}>
          <Bomber shouldThrow />
        </ErrorBoundary>
        <Text>footer</Text>
      </Box>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('header')
    expect(frame).toContain('falhou')
    expect(frame).toContain('footer')
    vi.restoreAllMocks()
  })

  it('recupera após reset (mudança de key) — simula recover', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender, lastFrame } = render(
      <ErrorBoundary key="eb" fallback={<Text>falhou</Text>}>
        <Bomber shouldThrow />
      </ErrorBoundary>,
    )
    expect(lastFrame() ?? '').toContain('falhou')
    rerender(
      <ErrorBoundary key="eb2" fallback={<Text>falhou</Text>}>
        <Text>recuperei</Text>
      </ErrorBoundary>,
    )
    expect(lastFrame() ?? '').toContain('recuperei')
    vi.restoreAllMocks()
  })
})
