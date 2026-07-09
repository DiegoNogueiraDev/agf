/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Barra de comando da TUI (M1q) — campo de texto (`ink-text-input`) com paleta
 * de slash-commands filtrada por prefixo. Presentacional: estado e dispatch
 * vivem no container.
 */
import type { ReactElement } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import type { SlashCommand } from './dispatch.js'
import { isCtrlJ, applyCtrlJ } from './multiline-input.js'

export interface CommandBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  suggestions: SlashCommand[]
}

/** Input + paleta de sugestões (quando o texto começa por '/'). */
export function CommandBar({ value, onChange, onSubmit, suggestions }: CommandBarProps): ReactElement {
  useInput((input, key) => {
    if (isCtrlJ(input, key)) {
      onChange(applyCtrlJ(value))
    }
  })

  return (
    <Box flexDirection="column">
      {suggestions.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {suggestions.map((c) => (
            <Text key={c.name} dimColor>
              {c.source === 'skill' ? <Text color="magenta">[skill] </Text> : null}
              {c.usage} — {c.desc}
              {c.aliases && c.aliases.length > 0 ? (
                <Text color="grey"> ({c.aliases.map((a) => `/${a}`).join(', ')})</Text>
              ) : null}
            </Text>
          ))}
        </Box>
      )}
      <Box>
        <Text color="cyan">{'› '}</Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} placeholder="/help" />
      </Box>
    </Box>
  )
}
