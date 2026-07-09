/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Economy tab — full cost-reduction view from GET /api/v1/economy. Leads with the
 * dollar economy + the delegate-first headline (savings from agf emitting compact
 * output to the external agent), then the local prefix-cache economy and the
 * per-lever breakdown. Zero new SQL: the route composes existing core aggregators.
 */

import React, { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import type { EconomySnapshot } from '@/lib/types'
import { BigNumber, ByCommandTable, CachePanel, DelegatePanel, LeverBreakdown, ScaffoldPanel } from './economy-sections'

export function TokenEconomyTab(): React.JSX.Element {
  const [data, setData] = useState<EconomySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiClient
      .getEconomy()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <section aria-label="Economy" className="flex items-center justify-center h-full text-muted text-sm">
        Loading…
      </section>
    )
  }

  if (error) {
    return (
      <section aria-label="Economy" className="flex flex-col items-center justify-center h-full gap-2">
        <div role="alert" className="text-danger text-sm">
          {error}
        </div>
      </section>
    )
  }

  if (!data) {
    return (
      <section aria-label="Economy" className="flex items-center justify-center h-full text-muted text-sm">
        No data yet.
      </section>
    )
  }

  const { totals, delegate, cache, commands, levers, savingsRate, byCommand, scaffoldReuse } = data
  const hasActivity =
    totals.saved > 0 ||
    totals.tokensIn > 0 ||
    totals.tokensOut > 0 ||
    !!delegate ||
    cache.tokensSaved > 0 ||
    commands.calls > 0

  if (!hasActivity) {
    return (
      <section aria-label="Economy" className="flex items-center justify-center h-full text-muted text-sm">
        No data — run agf commands or LLM calls to populate economy metrics.
      </section>
    )
  }

  const cacheHitPct = Math.round(cache.hitRate * (cache.hitRate <= 1 ? 100 : 1))

  return (
    <section aria-label="Economy" className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
      {/* Hero — lead with dollars + the delegate-first headline */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <BigNumber
          label="Saved ($)"
          value={`$${totals.savedUsd.toFixed(totals.savedUsd >= 1 ? 2 : 4)}`}
          sub={`${savingsRate.toFixed(0)}% savings rate`}
          highlight
        />
        <BigNumber
          label="Delegate Savings"
          value={delegate ? `${delegate.savedPct}%` : '—'}
          sub={delegate ? `${delegate.cmdCalls.toLocaleString()} agf calls` : 'no agf calls yet'}
        />
        <BigNumber label="Cache Hit Rate" value={`${cacheHitPct}%`} sub={`${cache.totalHits.toLocaleString()} hits`} />
        <BigNumber label="Tokens Saved" value={totals.saved.toLocaleString()} sub="not sent to the model" />
        <BigNumber
          label="Spent ($)"
          value={`$${totals.costUsd.toFixed(4)}`}
          sub={totals.costUsd === 0 && delegate ? 'delegate mode — no local LLM' : 'actual LLM cost'}
        />
      </div>

      {delegate && <DelegatePanel delegate={delegate} commands={commands} />}

      <CachePanel cache={cache} />

      <ByCommandTable rows={byCommand} />

      <ScaffoldPanel scaffoldReuse={scaffoldReuse} />

      <LeverBreakdown levers={levers} />
    </section>
  )
}
