/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { useState, useCallback } from 'react'
import type { RelationType } from '@/lib/types'
import { EDGE_STYLES } from '@/lib/constants'
import { apiClient } from '@/lib/api-client'

const RELATION_TYPES: RelationType[] = [
  'depends_on',
  'blocks',
  'parent_of',
  'child_of',
  'related_to',
  'priority_over',
  'implements',
  'derived_from',
]

interface EdgeCreateDialogProps {
  fromId: string
  toId: string
  fromTitle?: string
  toTitle?: string
  onCreated: () => void
  onCancel: () => void
}

/** EdgeCreateDialog — auto-generated description placeholder. */
export function EdgeCreateDialog({
  fromId,
  toId,
  fromTitle,
  toTitle,
  onCreated,
  onCancel,
}: EdgeCreateDialogProps): React.JSX.Element {
  const [relationType, setRelationType] = useState<RelationType>('depends_on')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await apiClient.createEdge({
        from: fromId,
        to: toId,
        relationType,
        reason: reason.trim() || undefined,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create edge')
    } finally {
      setLoading(false)
    }
  }, [fromId, toId, relationType, reason, onCreated])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-edge rounded-lg shadow-xl w-96 p-4">
        <h3 className="text-sm font-bold mb-3">Create Relationship</h3>

        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-muted block mb-1">From</label>
            <div className="text-xs bg-surface-elevated px-2 py-1.5 rounded truncate">{fromTitle ?? fromId}</div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">To</label>
            <div className="text-xs bg-surface-elevated px-2 py-1.5 rounded truncate">{toTitle ?? toId}</div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Relation Type</label>
            <select
              value={relationType}
              onChange={(e) => setRelationType(e.target.value as RelationType)}
              className="w-full text-xs px-2 py-1.5 rounded bg-surface-elevated border border-edge focus:outline-none focus:border-accent"
            >
              {RELATION_TYPES.map((rt) => {
                const style = EDGE_STYLES[rt]
                return (
                  <option key={rt} value={rt}>
                    {style.label}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this relationship exists..."
              className="w-full text-xs px-2 py-1.5 rounded bg-surface-elevated border border-edge focus:outline-none focus:border-accent"
            />
          </div>

          {error && <div className="text-xs text-danger bg-surface-elevated px-2 py-1.5 rounded">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded bg-surface-elevated hover:bg-edge transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-accent text-white font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
