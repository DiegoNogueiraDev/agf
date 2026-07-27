/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * DiffPanel — exibe diffs coloridos em tempo real durante implementação.
 * Recebe DiffLineItem[] e renderiza com cores: + verde, - vermelho, header dim.
 * Painel com scroll: mostra últimas N linhas.
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

export interface DiffLineItem {
  type: 'header' | 'added' | 'removed' | 'context'
  text: string
}

export interface DiffPanelProps {
  diffs: DiffLineItem[]
  maxLines?: number
}

const LINE_COLOR: Record<DiffLineItem['type'], string | undefined> = {
  header: undefined,
  added: 'green',
  removed: 'red',
  context: undefined,
}

export function DiffPanel({ diffs, maxLines = 20 }: DiffPanelProps): ReactElement {
  if (diffs.length === 0) {
    return (
      <Box borderStyle="single" paddingX={1} marginTop={1}>
        <Text dimColor>Nenhuma edicao registrada ainda.</Text>
      </Box>
    )
  }

  const fileCount = diffs.filter((d) => d.type === 'header').length
  const visible = diffs.slice(-maxLines)
  const overflow = diffs.length - visible.length

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} marginTop={1}>
      <Text bold>
        Diff{' '}
        <Text dimColor>
          ({fileCount} arquivo{fileCount !== 1 ? 's' : ''})
        </Text>
      </Text>
      {overflow > 0 && <Text dimColor> ... +{overflow} linhas anteriores</Text>}
      {visible.map((line, i) => {
        const color = LINE_COLOR[line.type]
        return (
          <Text key={i} color={color} dimColor={color === undefined}>
            {line.text.length > 60 ? line.text.slice(0, 57) + '...' : line.text}
          </Text>
        )
      })}
    </Box>
  )
}
