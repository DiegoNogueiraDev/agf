/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * App — root of the agent-graph-flow web dashboard, pruned to two tabs:
 * Graph (@xyflow/react over the live project graph) and Economy (recharts over
 * the token/cost ledger). Tabs lazy-load; an ErrorBoundary + Suspense wraps the
 * active tab. Live data comes from /api/v1 (useGraphData, useStats) and refreshes
 * on backend SSE (useSSE). To add a tab, extend nav-config + add a lazy import.
 */

import React, { useState, useCallback, lazy, Suspense } from 'react'
import { ThemeProvider } from '@/providers/theme-provider'
import { Sidebar, type TabId } from '@/components/layout/sidebar'
import { NAV_ITEMS } from '@/components/layout/nav-config'
import { useGraphData } from '@/hooks/use-graph-data'
import { useStats } from '@/hooks/use-stats'
import { useSSE } from '@/hooks/use-sse'
import { SkeletonPage } from '@/components/layout/skeleton'
import { Breadcrumb } from '@/components/layout/breadcrumb'

// Lazy-load tabs
const GraphTab = lazy(() => import('@/components/tabs/graph-tab').then((m) => ({ default: m.GraphTab })))
const ColonyTab = lazy(() => import('@/components/tabs/colony-tab').then((m) => ({ default: m.ColonyTab })))
const TokenEconomyTab = lazy(() =>
  import('@/components/tabs/token-economy-tab').then((m) => ({ default: m.TokenEconomyTab })),
)

// Fonte única do label é o nav-config (node_d2a19b8c8915) — duplicar a string
// aqui foi o que deixou breadcrumb e sidebar divergirem no rename p/ 'Colony'.
const TAB_LABELS: Record<TabId, string> = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item.label])) as Record<
  TabId,
  string
>

const CHUNK_RETRY_KEY = 'chunk_retry_attempted'

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false
  const msg = error.message.toLowerCase()
  return msg.includes('dynamically imported module') || msg.includes('loading chunk') || msg.includes('failed to fetch')
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null }

  static getDerivedStateFromError(error: Error): { hasError: boolean; error: Error } {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error): void {
    if (isChunkLoadError(error) && !sessionStorage.getItem(CHUNK_RETRY_KEY)) {
      sessionStorage.setItem(CHUNK_RETRY_KEY, '1')
      window.location.reload()
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const isChunk = isChunkLoadError(this.state.error)
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted">
          <p className="text-sm">
            {isChunk ? 'This tab failed to load. The app may have been updated.' : 'Something went wrong.'}
          </p>
          <p className="text-xs text-danger">{this.state.error?.message}</p>
          <button
            onClick={() => {
              sessionStorage.removeItem(CHUNK_RETRY_KEY)
              window.location.reload()
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function LoadingFallback(): React.JSX.Element {
  return <SkeletonPage />
}

function AppContent(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('graph')

  const { graph, loading, error, validation, refresh } = useGraphData()
  const { stats, refresh: refreshStats } = useStats()

  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshStats()])
  }, [refresh, refreshStats])

  // SSE: auto-refresh on backend events
  useSSE(
    useCallback(() => {
      void handleRefresh()
    }, [handleRefresh]),
  )

  const done = stats?.byStatus?.done ?? 0
  const total = stats?.totalNodes ?? 0

  return (
    <>
      {/* Skip navigation for a11y */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-white focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <div className="h-screen flex flex-row">
        {/* Sidebar navigation */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Main area: header + content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Slim header */}
          <header
            role="banner"
            className="flex items-center justify-between gap-2 px-4 py-2 border-b border-edge bg-surface-alt md:px-6"
          >
            <div className="flex items-center gap-3 pl-10 md:pl-0">
              <Breadcrumb activeTab={activeTab} tabLabel={TAB_LABELS[activeTab]} onTabChange={setActiveTab} />
              {total > 0 && (
                <span className="text-xs text-muted">
                  {done}/{total} done
                </span>
              )}
            </div>
          </header>

          {/* Content */}
          <main
            id="main-content"
            role="main"
            aria-label={`${TAB_LABELS[activeTab]} content`}
            className="flex-1 min-h-0 overflow-hidden"
          >
            <ErrorBoundary key={activeTab}>
              <Suspense fallback={<LoadingFallback />}>
                {activeTab === 'graph' && (
                  <GraphTab
                    graph={graph}
                    loading={loading}
                    error={error}
                    validation={validation}
                    onRetry={handleRefresh}
                    onImportPrd={handleRefresh}
                  />
                )}
                {activeTab === 'colony' && (
                  <ColonyTab
                    graph={graph}
                    loading={loading}
                    error={error}
                    validation={validation}
                    onRetry={handleRefresh}
                    onImportPrd={handleRefresh}
                  />
                )}
                {activeTab === 'economy' && <TokenEconomyTab />}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  )
}

/** App — root component: theme context wrapping the two-tab workstation. */
export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}
