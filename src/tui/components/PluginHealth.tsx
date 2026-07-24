/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-plugin-health-widget — Plugin health status widget for the TUI.
 *
 * Displays plugin states: Healthy (green), Degraded (yellow), Failed (red),
 * Starting (blue), Stopped (grey). Each plugin shows name + state with color.
 */
import { Box, Text } from 'ink'
import type { ReactElement } from 'react'

export type PluginHealthState = 'healthy' | 'degraded' | 'failed' | 'starting' | 'stopped'

export interface PluginInfo {
  name: string
  state: PluginHealthState
}

export interface PluginHealthProps {
  plugins: PluginInfo[]
}

export function getPluginStateColor(state: PluginHealthState): string {
  switch (state) {
    case 'healthy':
      return 'green'
    case 'degraded':
      return 'yellow'
    case 'failed':
      return 'red'
    case 'starting':
      return 'blue'
    default:
      return 'grey'
  }
}

const STATE_LABELS: Record<PluginHealthState, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  failed: 'Failed',
  starting: 'Starting...',
  stopped: 'Stopped',
}

export function PluginHealth({ plugins }: PluginHealthProps): ReactElement {
  if (plugins.length === 0) return <Text></Text>

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single">
      <Text bold>Plugins</Text>
      {plugins.map((p) => (
        <Text key={p.name}>
          {'  '}
          <Text color={getPluginStateColor(p.state)}>●</Text> {p.name}
          <Text dimColor> — {STATE_LABELS[p.state]}</Text>
        </Text>
      ))}
    </Box>
  )
}
