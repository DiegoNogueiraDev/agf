/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_1d1af814eb83 — Search overlay for FTS node lookup.
 *
 * Pure search + Ink component for the overlay UI.
 */

import { useState, useRef, useEffect, type ReactElement } from 'react'
import { Box, Text, useInput } from 'ink'
import { vimNav, type VimNavState } from './vim-nav.js'

export interface SearchableNode {
  id: string
  title: string
  type: string
  status: string
  parentId: string | null | undefined
}

export interface SearchOverlayProps {
  nodes: SearchableNode[]
  onSelect: (node: SearchableNode) => void
  onDelete: (node: SearchableNode) => void
  onClose: () => void
}

/**
 * Pure function: filter + rank nodes by title match.
 * Sorts by: exact match > startsWith > substring.
 */
export function searchNodes(allNodes: SearchableNode[], query: string): SearchableNode[] {
  if (!query.trim()) return allNodes
  const q = query.toLowerCase().trim()
  const scored = allNodes
    .map((n) => {
      const t = n.title.toLowerCase()
      let score = 0
      if (t === q) score = 3
      else if (t.startsWith(q)) score = 2
      else if (t.includes(q)) score = 1
      return { node: n, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.map((s) => s.node)
}

/**
 * Search overlay component.
 *
 * Opens with `/`, user types query, results filter in real-time.
 * j/k navigate, Enter selects, Del deletes (with confirm), Esc closes.
 */
export function SearchOverlay({ nodes, onSelect, onDelete, onClose }: SearchOverlayProps): ReactElement {
  const [query, setQuery] = useState('')
  const [nav, setNav] = useState<VimNavState>({ cursor: 0, count: 0 })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const inputRef = useRef('')

  const results = searchNodes(nodes, query)

  // Sync navigation state with results
  useEffect(() => {
    setNav((prev) => vimNav.updateCount(prev, results.length))
  }, [results.length])

  useInput((_input, key) => {
    if (key.escape) {
      if (confirmDelete) {
        setConfirmDelete(null)
        return
      }
      onClose()
      return
    }

    if (key.return) {
      if (results.length === 0) return
      const selected = results[nav.cursor]
      if (!selected) return
      if (confirmDelete === selected.id) {
        onDelete(selected)
        setConfirmDelete(null)
        return
      }
      onSelect(selected)
      return
    }

    // Backspace → remove last char from query
    if (key.backspace) {
      if (query === '') {
        onClose()
        return
      }
      inputRef.current = inputRef.current.slice(0, -1)
      setQuery(inputRef.current)
      return
    }

    // Delete → confirm delete of selected node
    if (key.delete) {
      if (results.length === 0) return
      const selected = results[nav.cursor]
      if (selected) setConfirmDelete(selected.id)
      return
    }

    // j/k/g/G navigation
    if (_input === 'j') {
      setNav((prev) => vimNav.handleKey(prev, 'j'))
      return
    }
    if (_input === 'k') {
      setNav((prev) => vimNav.handleKey(prev, 'k'))
      return
    }
    if (_input === 'g') {
      setNav((prev) => vimNav.handleKey(prev, 'g'))
      return
    }
    if (_input === 'G') {
      setNav((prev) => vimNav.handleKey(prev, 'G'))
      return
    }

    // Printable characters → build query
    if (_input.length === 1 && _input >= ' ') {
      inputRef.current += _input
      setQuery(inputRef.current)
      return
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box>
        <Text bold color="cyan">
          /{' '}
        </Text>
        <Text>{query}</Text>
        {query.length === 0 && <Text dimColor>digite para buscar nodes…</Text>}
      </Box>

      {results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {results.slice(0, 15).map((node, i) => {
            const isSelected = i === nav.cursor
            const isDeleting = confirmDelete === node.id
            return (
              <Box key={node.id}>
                <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                  {isSelected ? '\u276f ' : '  '}
                </Text>
                <Text
                  color={
                    isSelected
                      ? 'cyan'
                      : node.status === 'done'
                        ? 'green'
                        : node.status === 'in_progress'
                          ? 'yellow'
                          : 'white'
                  }
                  bold={isSelected}
                  strikethrough={isDeleting}
                >
                  [{node.type}] {node.title} ({node.status})
                </Text>
                {isDeleting && <Text color="red"> DEL? Enter confirma</Text>}
              </Box>
            )
          })}
          {results.length > 15 && <Text dimColor>... +{results.length - 15} mais</Text>}
        </Box>
      )}

      {results.length === 0 && query.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Nenhum resultado</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>j/k navega · Enter seleciona · Del/Backspace apaga · Esc fecha</Text>
      </Box>
    </Box>
  )
}
