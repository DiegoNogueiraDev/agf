/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * ColonyTab — tab Colony com toggle entre Structure (@xyflow graph existente,
 * inalterado) e Colony (ColonyView figurada com dados de use-colony-data).
 * EXPANDE o graph-tab.tsx sem regredi-lo: a Structure reusa o GraphTab
 * integralmente com as mesmas props.
 */

import { useState } from 'react'
import { Network, Bug } from 'lucide-react'
import { GraphTab } from './graph-tab'
import { ColonyView } from './colony-view'
import type { GraphDocument } from '@/lib/types'
import type { GraphValidationState } from '@/hooks/use-graph-data'

type ColonySubView = 'structure' | 'colony'

interface ColonyTabProps {
  graph: GraphDocument | null
  loading?: boolean
  error?: string | null
  validation?: GraphValidationState
  onRetry?: () => void
  onImportPrd?: () => void
}

function ToggleControl({
  active,
  onChange,
}: {
  active: ColonySubView
  onChange: (v: ColonySubView) => void
}): React.JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="Colony tab view toggle"
      className="flex gap-1 p-0.5 rounded-lg bg-surface-alt border border-edge self-start"
    >
      <button
        role="tab"
        aria-selected={active === 'structure'}
        onClick={() => onChange('structure')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
          active === 'structure' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
        }`}
      >
        <Network className="w-3.5 h-3.5" />
        Structure
      </button>
      <button
        role="tab"
        aria-selected={active === 'colony'}
        onClick={() => onChange('colony')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
          active === 'colony' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
        }`}
      >
        <Bug className="w-3.5 h-3.5" />
        Colony
      </button>
    </div>
  )
}

export function ColonyTab(props: ColonyTabProps): React.JSX.Element {
  const [subView, setSubView] = useState<ColonySubView>('structure')

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-3 pb-2">
        <ToggleControl active={subView} onChange={setSubView} />
      </div>
      <div className="flex-1 min-h-0">{subView === 'structure' ? <GraphTab {...props} /> : <ColonyView />}</div>
    </div>
  )
}
