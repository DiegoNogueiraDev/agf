import type { ReactElement } from 'react'
import { Box, Text } from 'ink'
import { Sparkline, Gauge } from './Widgets.js'

export interface TokenBudgetViewProps {
  budgetUsd: number
  usedUsd: number
  tokensUsed: number
  tokensIn: number
  tokensOut: number
  calls: number
  model: string
  spikeData?: number[]
}

export function TokenBudgetView({
  budgetUsd,
  usedUsd,
  tokensUsed,
  tokensIn,
  tokensOut,
  calls,
  model,
  spikeData = [],
}: TokenBudgetViewProps): ReactElement {
  const remaining = Math.max(0, budgetUsd - usedUsd)
  const pct = ((usedUsd / budgetUsd) * 100).toFixed(1)

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single">
      <Text bold color="cyan">
        Token Economy
      </Text>
      <Box marginTop={0}>
        <Gauge value={usedUsd} max={budgetUsd} width={30} color="green" label="Budget" />
      </Box>
      <Box>
        <Text dimColor>
          Used: ${usedUsd.toFixed(4)} / ${budgetUsd.toFixed(2)} ({pct}%)
        </Text>
      </Box>
      <Box>
        <Text dimColor>Remaining: ${remaining.toFixed(4)}</Text>
      </Box>
      <Box marginTop={0}>
        <Text color="cyan">Tokens: {tokensUsed.toLocaleString()}</Text>
      </Box>
      <Box>
        <Text dimColor>
          In: {tokensIn.toLocaleString()} · Out: {tokensOut.toLocaleString()} · Calls: {calls}
        </Text>
      </Box>
      <Box>
        <Text dimColor>Model: {model}</Text>
      </Box>
      {spikeData.length > 0 && (
        <Box marginTop={0} flexDirection="column">
          <Text dimColor>Token spikes:</Text>
          <Sparkline data={spikeData} width={30} color="yellow" />
        </Box>
      )}
    </Box>
  )
}

export interface CostForecastProps {
  dailyCosts: number[]
  model: string
  daysRemaining?: number
}

export function CostForecast({ dailyCosts, model, daysRemaining = 14 }: CostForecastProps): ReactElement {
  const avgDaily = dailyCosts.length > 0 ? dailyCosts.reduce((a, b) => a + b, 0) / dailyCosts.length : 0
  const projected = avgDaily * daysRemaining
  const trend = dailyCosts.length >= 2 ? dailyCosts[dailyCosts.length - 1] - dailyCosts[0] : 0

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single">
      <Text bold color="cyan">
        Cost Forecast
      </Text>
      {dailyCosts.length > 0 && (
        <Box marginTop={0}>
          <Sparkline data={dailyCosts} width={20} color="magenta" />
        </Box>
      )}
      <Box>
        <Text dimColor>Avg daily: ${avgDaily.toFixed(4)}</Text>
      </Box>
      <Box>
        <Text dimColor>
          Projection ({daysRemaining}d): ${projected.toFixed(4)}
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          Trend: {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} ${Math.abs(trend).toFixed(4)}
        </Text>
      </Box>
      <Box>
        <Text dimColor>Model: {model}</Text>
      </Box>
    </Box>
  )
}

export interface CacheHeatmapProps {
  sessionHits: number
  sessionMisses: number
  toolCacheHits: number
  toolCacheMisses: number
  artifactCacheHits: number
  artifactCacheMisses: number
  totalTokensSaved: number
  costSavedUsd: number
}

export function CacheHeatmap({
  sessionHits,
  sessionMisses,
  toolCacheHits,
  toolCacheMisses,
  artifactCacheHits,
  artifactCacheMisses,
  totalTokensSaved,
  costSavedUsd,
}: CacheHeatmapProps): ReactElement {
  const row = (label: string, hits: number, misses: number): ReactElement => {
    const total = hits + misses
    const rate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0'
    const barLen = Math.round((hits / Math.max(1, total)) * 15)
    const bar = '█'.repeat(barLen) + '░'.repeat(15 - barLen)
    const color = rate === '100.0' ? 'green' : parseFloat(rate) > 70 ? 'cyan' : parseFloat(rate) > 40 ? 'yellow' : 'red'
    return (
      <Box>
        <Box width={14}>
          <Text dimColor>{label}</Text>
        </Box>
        <Text color={color}>{bar}</Text>
        <Text color="grey" dimColor>
          {' '}
          {rate}%
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single">
      <Text bold color="cyan">
        Cache Performance
      </Text>
      {row('Session', sessionHits, sessionMisses)}
      {row('Tool', toolCacheHits, toolCacheMisses)}
      {row('Artifact', artifactCacheHits, artifactCacheMisses)}
      <Box>
        <Text dimColor>
          Tokens saved: {totalTokensSaved.toLocaleString()} ≈ ${costSavedUsd.toFixed(4)}
        </Text>
      </Box>
    </Box>
  )
}
