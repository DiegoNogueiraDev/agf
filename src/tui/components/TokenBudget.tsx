/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TokenBudget — mostra budget de tokens, gasto e projecao.
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

export interface TokenBudgetProps {
  budgetUsd: number
  usedUsd: number
  tokensUsed: number
}

export function TokenBudget({ budgetUsd, usedUsd, tokensUsed }: TokenBudgetProps): ReactElement {
  const remaining = Math.max(0, budgetUsd - usedUsd)
  const pct = Math.round((usedUsd / budgetUsd) * 100)
  const overBudget = pct > 80

  return (
    <Box flexDirection="row" borderStyle="single" paddingX={1}>
      <Text bold>Budget: </Text>
      <Text color={overBudget ? 'red' : 'green'}>
        ${usedUsd.toFixed(2)}/${budgetUsd.toFixed(2)} ({pct}%)
      </Text>
      <Text dimColor> · {tokensUsed} tok</Text>
      {remaining > 0 && <Text dimColor> · restante ${remaining.toFixed(2)}</Text>}
      {overBudget && (
        <Text color="red" bold>
          {' '}
          ⚠ orcamento critico!
        </Text>
      )}
    </Box>
  )
}
