import { Box, Text } from 'ink'
import type { ReactElement } from 'react'

export interface ConfirmDialogProps {
  title: string
  message?: string
}

export function ConfirmDialog({ title, message }: ConfirmDialogProps): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" paddingX={1} paddingY={0}>
      <Box>
        <Text bold color="yellow">
          {title}
        </Text>
      </Box>
      {message && (
        <Box>
          <Text>{message}</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>
          {'>'} y/<Text color="red">N</Text> — <Text color="green">y</Text> confirmar{'  '}
          <Text color="red">N</Text> cancelar
        </Text>
      </Box>
    </Box>
  )
}
