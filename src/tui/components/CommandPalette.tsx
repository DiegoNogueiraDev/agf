import { useState, useEffect, type ReactElement } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import type { SlashCommand } from '../dispatch.js'

export interface CommandPaletteProps {
  commands: SlashCommand[]
  onSelect: (command: SlashCommand) => void
  onClose: () => void
  visible: boolean
}

type Category = 'Basic' | 'Algorithm' | 'Skill' | 'Analysis' | 'View' | 'Config'

export function categorize(cmd: SlashCommand): Category {
  if (cmd.source === 'skill') return 'Skill'
  if (cmd.name.startsWith('graph-')) return 'Skill'
  if (['stats', 'metrics', 'phase', 'model', 'skills', 'skill', 'feedback', 'deps', 'audit'].includes(cmd.name))
    return 'Analysis'
  if (['kanban', 'diff', 'graph-'].some((p) => cmd.name.startsWith(p) || cmd.name === 'kanban' || cmd.name === 'diff'))
    return 'View'
  if (['preset', 'collaborate', 'scaffold', 'provider', 'wizard', 'surface', 'workbench'].includes(cmd.name))
    return 'Config'
  if (
    [
      'critical-path',
      'topological-sort',
      'dijkstra',
      'bellman-ford',
      'floyd-warshall',
      'scc',
      'bfs',
      'dfs',
      'mst',
      'max-flow',
      'hungarian',
      'page-rank',
      'centrality',
      'graph-metrics',
      'bridges',
      'knapsack',
      'lcs',
      'rod-cutting',
      'edit-distance',
      'activity-select',
      'huffman',
      'rabin-karp',
      'suffix-search',
      'monte-carlo',
      'bayesian',
      'markov',
      'flow-efficiency',
      'queue-sim',
      'kalman',
      'cfd',
      'cluster',
      'gradient-descent',
      'weighted-majority',
      'linear-program',
      'set-cover',
      'tsp',
      'vertex-cover',
      'genetic',
      'branch-bound',
      'backtrack',
      'chi-square',
      'linear-regression',
      'entropy',
      'quickselect',
      'seasonality',
    ].includes(cmd.name)
  )
    return 'Algorithm'
  return 'Basic'
}

export function CommandPalette({ commands, onSelect, onClose, visible }: CommandPaletteProps): ReactElement | null {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    setQuery('')
    setSelectedIdx(0)
  }, [visible])

  const filtered = commands.filter((c) => {
    const q = query.toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.desc.toLowerCase().includes(q) ||
      c.aliases?.some((a) => a.toLowerCase().includes(q))
    )
  })

  const grouped = new Map<Category, SlashCommand[]>()
  for (const cmd of filtered) {
    const cat = categorize(cmd)
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(cmd)
  }
  const groupOrder: Category[] = ['Basic', 'Algorithm', 'Skill', 'Analysis', 'View', 'Config']

  useInput((input, key) => {
    if (!visible) return
    if (key.escape) {
      onClose()
      return
    }
    if (key.return && filtered[selectedIdx]) {
      onSelect(filtered[selectedIdx])
      return
    }
    if (key.upArrow) {
      setSelectedIdx(Math.max(0, selectedIdx - 1))
      return
    }
    if (key.downArrow) {
      setSelectedIdx(Math.min(filtered.length - 1, selectedIdx + 1))
      return
    }
  })

  if (!visible) return null

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={0} position="absolute">
      <Text bold color="cyan">
        Command Palette (Ctrl+P)
      </Text>
      <Box marginBottom={0}>
        <Text color="cyan">{'> '}</Text>
        <TextInput value={query} onChange={setQuery} placeholder="filter commands..." />
      </Box>
      <Box flexDirection="column" marginTop={0}>
        {filtered.length === 0 && (
          <Text color="grey" dimColor>
            No matching commands
          </Text>
        )}
        {groupOrder.map((cat) => {
          const cmds = grouped.get(cat)
          if (!cmds || cmds.length === 0) return null
          return (
            <Box key={cat} flexDirection="column">
              <Text bold color="grey">
                {cat}
              </Text>
              {cmds.map((cmd, _i) => {
                const globalIdx = filtered.indexOf(cmd)
                return (
                  <Box key={cmd.name}>
                    <Text color={globalIdx === selectedIdx ? 'cyan' : 'white'} bold={globalIdx === selectedIdx}>
                      {globalIdx === selectedIdx ? '▸ ' : '  '}
                      {cmd.name}
                    </Text>
                    {cmd.aliases && cmd.aliases.length > 0 && (
                      <Text color="grey" dimColor>
                        {' '}
                        ({cmd.aliases.map((a) => `/${a}`).join(', ')})
                      </Text>
                    )}
                    <Text color="grey" dimColor>
                      {' — '}
                      {cmd.desc}
                    </Text>
                  </Box>
                )
              })}
            </Box>
          )
        })}
      </Box>
      <Box marginTop={1}>
        <Text color="grey" dimColor>
          ↑↓ navigate · ↵ select · ⎋ close
        </Text>
      </Box>
    </Box>
  )
}
