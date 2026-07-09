import type { ReactElement } from 'react'
import { Box, Text } from 'ink'
import type { Severity } from '../status-message.js'
import { formatProviderStatus } from './footer-provider-status.js'

export interface FooterBarProps {
  harnessScore?: number
  harnessGrade?: string
  tokenEstimate?: number
  mode?: string
  staleStatus?: 'fresh' | 'stale' | 'never'
  statusMessage?: { text: string; severity: Severity }
  shortcuts?: Array<{ key: string; desc: string }>
  compactMode?: boolean
  helpHint?: string
  nextTask?: { title: string; id: string; reason: string } | null
  providerId?: string
  providerReachable?: boolean
}

const globalKeys = [
  { key: '^P', action: 'Palette' },
  { key: '/', action: 'Cmd' },
  { key: '⇥', action: 'Next' },
  { key: '⎋', action: 'Back' },
  { key: 'Q', action: 'Quit' },
]

const SEVERITY_COLORS: Record<Severity, string> = {
  ok: 'green',
  warn: 'yellow',
  error: 'red',
}

export function FooterBar({
  harnessScore,
  harnessGrade,
  tokenEstimate,
  mode,
  staleStatus,
  statusMessage: statusMsg,
  shortcuts,
  compactMode,
  helpHint,
  nextTask,
  providerId,
  providerReachable = false,
}: FooterBarProps): ReactElement {
  const providerStatus = formatProviderStatus({ providerId, reachable: providerReachable })
  return (
    <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} paddingX={1} paddingY={0}>
      {globalKeys.map((kb) => (
        <Box key={kb.key} marginRight={1}>
          <Text bold color="cyan">
            {kb.key}{' '}
          </Text>
          <Text color="grey" dimColor>
            {kb.action}
          </Text>
        </Box>
      ))}
      {shortcuts?.map((s) => (
        <Box key={s.key} marginRight={1}>
          <Text color="yellow" bold>
            {s.key}{' '}
          </Text>
          <Text color="grey" dimColor>
            {s.desc}
          </Text>
        </Box>
      ))}
      <Box flexGrow={1} />
      {nextTask && (
        <Box marginRight={2}>
          <Text color="green" bold>
            {'\u2192 '}
          </Text>
          <Text color="cyan" dimColor>
            {nextTask.title}
          </Text>
          <Text color="grey"> /n</Text>
        </Box>
      )}
      {helpHint && (
        <Box marginRight={2}>
          <Text color="cyan" dimColor>
            {helpHint}
          </Text>
        </Box>
      )}
      {statusMsg && (
        <Box marginRight={2}>
          <Text color={SEVERITY_COLORS[statusMsg.severity]}>{statusMsg.text}</Text>
        </Box>
      )}
      {compactMode && (
        <Box marginRight={1}>
          <Text color="green" bold>
            compact
          </Text>
        </Box>
      )}
      {mode && (
        <Box marginRight={1}>
          <Text color="magenta" dimColor>
            mode: {mode}
          </Text>
        </Box>
      )}
      {harnessScore !== undefined && (
        <Box marginRight={1}>
          <Text color={harnessGrade === 'A' ? 'green' : harnessGrade === 'B' ? 'cyan' : 'yellow'}>
            Score: {harnessGrade} ({harnessScore})
          </Text>
        </Box>
      )}
      {staleStatus && staleStatus !== 'fresh' && (
        <Box marginRight={1}>
          <Text color="red" bold={staleStatus === 'stale'}>
            {staleStatus === 'never' ? '\u25cb' : '\u25cf'} {staleStatus}
          </Text>
        </Box>
      )}
      {providerId !== undefined && (
        <Box marginRight={1}>
          <Text color={providerStatus.color}>{providerStatus.dot} </Text>
          <Text color="grey" dimColor>
            {providerStatus.label}
          </Text>
        </Box>
      )}
      {tokenEstimate !== undefined && (
        <Box>
          <Text color="grey" dimColor>
            ~{tokenEstimate} tok
          </Text>
        </Box>
      )}
    </Box>
  )
}
