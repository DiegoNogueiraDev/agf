import type { ReactElement } from 'react'
import { Text } from 'ink'

const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

export interface SparklineProps {
  data: number[]
  width?: number
  color?: string
}

export function Sparkline({ data, width = 20, color = 'cyan' }: SparklineProps): ReactElement {
  if (data.length === 0) return <Text> </Text>
  const sampled = data.length <= width ? data : evenlySample(data, width)
  const min = Math.min(...sampled)
  const max = Math.max(...sampled)
  const range = max - min || 1
  const chars = sampled.map((v) => {
    const idx = Math.min(Math.floor(((v - min) / range) * (sparkChars.length - 1)), sparkChars.length - 1)
    return sparkChars[idx]
  })
  return <Text color={color}>{chars.join('')}</Text>
}

function evenlySample(arr: number[], n: number): number[] {
  const result: number[] = []
  const step = (arr.length - 1) / (n - 1 || 1)
  for (let i = 0; i < n; i++) {
    const idx = Math.min(Math.round(i * step), arr.length - 1)
    result.push(arr[idx])
  }
  return result
}

export interface GaugeProps {
  value: number
  max: number
  width?: number
  color?: string
  label?: string
}

const blockChars = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']

export function Gauge({ value, max, width = 20, color = 'green', label }: GaugeProps): ReactElement {
  const ratio = Math.min(value / max, 1)
  const filled = Math.floor(ratio * width)
  const partial = Math.round((ratio * width - filled) * (blockChars.length - 1))
  const bar = '█'.repeat(filled) + (filled < width ? blockChars[partial] : '')
  const empty = ' '.repeat(Math.max(0, width - filled - 1))
  const pct = (ratio * 100).toFixed(0)
  return (
    <Text>
      {label ? <Text dimColor>{label} </Text> : null}
      <Text color={color}>{bar}</Text>
      <Text color="grey" dimColor>
        {empty} {pct}%
      </Text>
    </Text>
  )
}

export interface DiffLineProps {
  change: 'add' | 'del' | 'ctx'
  text: string
}

export function DiffLine({ change, text }: DiffLineProps): ReactElement {
  const prefix = change === 'add' ? '+' : change === 'del' ? '-' : ' '
  const color = change === 'add' ? 'green' : change === 'del' ? 'red' : 'grey'
  return (
    <Text color={color}>
      {prefix} {text}
    </Text>
  )
}

export interface StatusPillProps {
  status: string
  compact?: boolean
}

const STATUS_STYLE: Record<string, { icon: string; color: string; label: string }> = {
  backlog: { icon: '·', color: 'grey', label: 'backlog' },
  ready: { icon: '○', color: 'cyan', label: 'ready' },
  in_progress: { icon: '◐', color: 'yellow', label: 'in_progress' },
  blocked: { icon: '⨂', color: 'red', label: 'blocked' },
  done: { icon: '●', color: 'green', label: 'done' },
}

export function StatusPill({ status, compact }: StatusPillProps): ReactElement {
  const style = STATUS_STYLE[status] ?? { icon: '·', color: 'grey', label: status }
  return (
    <Text color={style.color} bold>
      {style.icon}
      {compact ? '' : <Text color={style.color} dimColor>{` ${style.label}`}</Text>}
    </Text>
  )
}

export interface ProgressBarProps {
  done: number
  total: number
  width?: number
  color?: string
  label?: string
}

export function ProgressBar({ done, total, width = 30, color = 'green', label }: ProgressBarProps): ReactElement {
  const ratio = total > 0 ? done / total : 0
  const filled = Math.round(ratio * width)
  const bar = '█'.repeat(Math.min(filled, width))
  const empty = ' '.repeat(Math.max(0, width - filled))
  const pct = (ratio * 100).toFixed(0)
  return (
    <Text>
      {label ? <Text dimColor>{label} </Text> : null}
      <Text color={color}>{bar}</Text>
      <Text color="grey" dimColor>
        {empty}
      </Text>
      <Text color="cyan">
        {' '}
        {done}/{total} ({pct}%)
      </Text>
    </Text>
  )
}
