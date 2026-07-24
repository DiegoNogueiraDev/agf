/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Certainty panel (node_3ecf21eea0dc) — the operable WEB surface: pick a node,
 * see whether it is REALLY done and why. Without this picker the verdict view
 * would be unreachable from the dashboard (dormant capability, rule 9): a tab
 * nobody can drive delivers zero, however green its unit tests are.
 */

import React, { useState } from 'react'
import { CertaintyTab } from './certainty-tab'

export function CertaintyPanel(): React.JSX.Element {
  const [input, setInput] = useState('')
  const [nodeId, setNodeId] = useState<string | null>(null)

  return (
    <section aria-label="Delivery Certainty" className="p-4 space-y-4">
      <form
        className="flex gap-2 items-center"
        onSubmit={(e) => {
          e.preventDefault()
          const trimmed = input.trim()
          setNodeId(trimmed.length > 0 ? trimmed : null)
        }}
      >
        <label htmlFor="certainty-node" className="text-sm text-muted">
          Node
        </label>
        <input
          id="certainty-node"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="node_…"
          className="rounded border border-white/10 bg-transparent px-2 py-1 text-sm font-mono"
        />
        <button type="submit" className="rounded border border-white/10 px-3 py-1 text-sm">
          Check
        </button>
      </form>

      {nodeId ? (
        <CertaintyTab nodeId={nodeId} />
      ) : (
        <p className="text-sm text-muted">
          Enter a node id to see its delivery-certainty verdict and the pillars behind it.
        </p>
      )}
    </section>
  )
}
