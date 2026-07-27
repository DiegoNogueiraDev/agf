import { Component, type ReactElement, type ReactNode } from 'react'
import { Box, Text } from 'ink'

export interface ErrorBoundaryProps {
  children?: ReactNode
  fallback?: ReactElement
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Algo deu errado' }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }): void {
    console.error(error, errorInfo.componentStack ?? '')
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <Box flexDirection="column" borderStyle="round" paddingX={1} marginTop={1}>
          <Text color="red" bold>
            {'\u26A0'} Error
          </Text>
          <Text color="red">{this.state.errorMessage}</Text>
          <Text dimColor>Use Ctrl+R para recarregar ou /quit para sair</Text>
        </Box>
      )
    }
    return this.props.children
  }
}
