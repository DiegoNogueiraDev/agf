/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * economy-sections — presentational pieces for the Economy tab (SRP split so the
 * tab file stays a thin container). Each renders one slice of EconomySnapshot:
 * the delegate-first economy, the local prefix-cache, and the per-lever savings.
 */

import React from 'react'
import type {
  ByCommandRow,
  CacheEconomyView,
  CommandEconomyView,
  DelegateEconomyView,
  LeverSummary,
  ScaffoldReuseView,
} from '@/lib/types'

export function formatInt(n: number): string {
  return n.toLocaleString()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function BigNumber({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}): React.JSX.Element {
  return (
    <div
      className={`flex flex-col gap-0.5 p-4 rounded-xl border ${
        highlight ? 'bg-accent/10 border-accent/40' : 'bg-surface-elevated border-edge'
      }`}
    >
      <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}

/** Two-segment bar: emitted (accent) vs saved (muted) within the baseline total. */
function RatioBar({ emitted, total }: { emitted: number; total: number }): React.JSX.Element {
  const emittedPct = total > 0 ? Math.min(100, Math.round((emitted / total) * 100)) : 0
  return (
    <div className="h-3 w-full rounded-full bg-surface overflow-hidden flex" aria-hidden="true">
      <div className="h-full bg-accent" style={{ width: `${emittedPct}%` }} />
      <div className="h-full bg-success/60" style={{ width: `${100 - emittedPct}%` }} />
    </div>
  )
}

export function DelegatePanel({
  delegate,
  commands,
}: {
  delegate: DelegateEconomyView
  commands: CommandEconomyView
}): React.JSX.Element {
  return (
    <section
      aria-label="Delegate economy"
      className="flex flex-col gap-3 p-4 rounded-xl bg-surface-alt border border-edge"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Delegate Economy</h2>
        <span className="text-xs text-muted">
          agf emits compact output to the external agent instead of the raw graph
        </span>
      </div>

      <RatioBar emitted={delegate.cmdTok} total={delegate.baselineTok} />
      <div className="flex items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent inline-block" /> emitted {formatInt(delegate.cmdTok)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success/60 inline-block" /> saved {formatInt(delegate.delegateSaved)}
        </span>
        <span>
          baseline {formatInt(delegate.baselineTok)}
          {delegate.baselineExtrapolated ? ' (est.)' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-1">
        <Stat label="Saved" value={`${delegate.savedPct}%`} />
        <Stat label="agf calls" value={formatInt(delegate.cmdCalls)} />
        <Stat label="Avg tok / call" value={formatInt(delegate.avgTokPerCmd)} />
        <Stat label="Raw graph avoided" value={formatBytes(delegate.baselineBytes)} />
        <Stat label="Avg latency" value={`${Math.round(commands.avgDurationMs)} ms`} />
      </div>
    </section>
  )
}

export function CachePanel({ cache }: { cache: CacheEconomyView }): React.JSX.Element {
  const hitPct = Math.round(cache.hitRate * (cache.hitRate <= 1 ? 100 : 1))
  // Delegate-first: no local LLM calls → cache has nothing to measure. Show an
  // explanatory note so the zeros don't read as a bug.
  const noActivity = cache.totalHits + cache.totalMisses === 0
  return (
    <section aria-label="Local cache" className="flex flex-col gap-3 p-4 rounded-xl bg-surface-alt border border-edge">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Local Cache</h2>
        <span className="text-xs text-muted">prefix-cache hits — yes, this counts toward savings</span>
      </div>
      {noActivity ? (
        <p className="text-xs text-muted">
          No local LLM calls yet — nothing to cache. In delegate-first mode the external agent runs the model, so these
          populate only when a provider runs <code className="text-foreground">--live</code>. Real savings so far come
          from the <span className="text-foreground">Delegate Economy</span> above.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Stat label="Hit rate" value={`${hitPct}%`} />
          <Stat label="Hits" value={formatInt(cache.totalHits)} />
          <Stat label="Misses" value={formatInt(cache.totalMisses)} />
          <Stat label="Tokens saved" value={formatInt(cache.tokensSaved)} />
          <Stat
            label="$ saved"
            value={`$${cache.estimatedSavingsUsd.toFixed(cache.estimatedSavingsUsd >= 1 ? 2 : 4)}`}
          />
        </div>
      )}
    </section>
  )
}

export function LeverBreakdown({ levers }: { levers: LeverSummary[] }): React.JSX.Element {
  const sorted = [...levers].sort((a, b) => b.totalSaved - a.totalSaved)
  const max = sorted.reduce((m, l) => Math.max(m, l.totalSaved), 0)
  return (
    <section aria-label="Savings by lever" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-foreground">Savings by Lever</h2>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted">No lever savings recorded yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {sorted.map((lever) => {
              const widthPct = max > 0 ? Math.round((lever.totalSaved / max) * 100) : 0
              return (
                <div key={lever.lever} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 truncate font-mono text-muted" title={lever.lever}>
                    {lever.lever}
                  </span>
                  <div className="flex-1 h-4 rounded bg-surface overflow-hidden">
                    <div
                      className="h-full rounded bg-accent opacity-80"
                      style={{ width: `${Math.max(widthPct, 2)}%` }}
                      aria-label={`${lever.lever}: ${lever.totalSaved} tokens saved`}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums text-foreground">
                    {formatInt(lever.totalSaved)}
                  </span>
                </div>
              )
            })}
          </div>
          <table aria-label="Lever savings" className="w-full text-xs border-collapse mt-2">
            <thead>
              <tr className="border-b border-edge text-left text-muted">
                <th className="py-1.5 pr-4 font-medium">Lever</th>
                <th className="py-1.5 pr-4 font-medium">Tokens Saved</th>
                <th className="py-1.5 font-medium">Calls</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((lever) => (
                <tr key={lever.lever} className="border-b border-edge/50 hover:bg-surface-elevated transition-colors">
                  <td className="py-1.5 pr-4 font-mono text-foreground">{lever.lever}</td>
                  <td className="py-1.5 pr-4 text-muted tabular-nums">{formatInt(lever.totalSaved)}</td>
                  <td className="py-1.5 text-muted tabular-nums">{lever.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

export function ByCommandTable({ rows }: { rows: ByCommandRow[] }): React.JSX.Element {
  const sorted = [...rows].sort((a, b) => b.savedTokens - a.savedTokens)
  return (
    <section aria-label="Savings by command" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-foreground">Savings by Command</h2>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted">No per-command savings recorded yet.</p>
      ) : (
        <table aria-label="By-command savings" className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-edge text-left text-muted">
              <th className="py-1.5 pr-4 font-medium">Command</th>
              <th className="py-1.5 pr-4 font-medium">Calls</th>
              <th className="py-1.5 pr-4 font-medium">Tokens Saved</th>
              <th className="py-1.5 font-medium">Savings Rate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.command} className="border-b border-edge/50 hover:bg-surface-elevated transition-colors">
                <td className="py-1.5 pr-4 font-mono text-foreground">{row.command}</td>
                <td className="py-1.5 pr-4 text-muted tabular-nums">{row.count}</td>
                <td className="py-1.5 pr-4 text-muted tabular-nums">{formatInt(row.savedTokens)}</td>
                <td className="py-1.5 tabular-nums text-foreground">{row.savingsRate.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function ScaffoldPanel({ scaffoldReuse }: { scaffoldReuse: ScaffoldReuseView }): React.JSX.Element {
  const hasReuse = scaffoldReuse.generated > 0 || scaffoldReuse.recovered > 0
  return (
    <section
      aria-label="Scaffold reuse"
      className="flex flex-col gap-2 p-4 rounded-xl bg-surface-alt border border-edge"
    >
      <h2 className="text-sm font-medium text-foreground">Scaffold Reuse (RAG-OUT)</h2>
      {hasReuse ? (
        <div className="flex items-center gap-4 text-xs text-muted">
          <span>
            {scaffoldReuse.recovered} of {scaffoldReuse.generated} generations recovered from cache
          </span>
          <span className="text-foreground font-medium">{formatInt(scaffoldReuse.tokensSaved)} tokens saved</span>
          <span>{Math.round(scaffoldReuse.savingsRatio * 100)}% ratio</span>
        </div>
      ) : (
        <p className="text-xs text-muted">No scaffold reuse recorded yet.</p>
      )}
    </section>
  )
}
