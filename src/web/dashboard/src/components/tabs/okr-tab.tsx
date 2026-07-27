/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * OkrTab — a superfície web do cockpit de OKR (node_82db62c74056), lendo
 * GET /api/v1/okr, que por sua vez compõe o MESMO coletor de `agf okr`.
 * A aba não recalcula nada: o que a tela mostra é o que o terminal imprime.
 *
 * Apresentacional de propósito — o fetch vive em `OkrTabContainer` logo
 * abaixo, e a tabela recebe linhas prontas. Isso mantém a asserção do teste
 * sobre o que o dev VÊ, com dados reais e sem dublê de cliente HTTP.
 *
 * Contrato visual que não pode ser afrouxado: `attainment: null` é AUSÊNCIA
 * de dado e se desenha como '—'. Pintá-lo como 0% transformaria "não sei" em
 * "medi e deu zero" — o falso-verde ao contrário, igualmente mentiroso.
 */

import React, { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import type { OkrRow, OkrReport } from '@/lib/types'

const STATUS_STYLES: Record<OkrRow['status'], string> = {
  'on-track': 'bg-success/10 text-success border-success/30',
  'at-risk': 'bg-danger/10 text-danger border-danger/30',
  'no-data': 'bg-surface-alt text-muted border-edge',
}

/** Atingimento como percentual; ausência de dado nunca vira 0%. */
function formatAttainment(attainment: number | null): string {
  if (attainment === null) return '—'
  return `${Math.round(attainment * 100)}%`
}

export interface OkrTabProps {
  rows: OkrRow[]
  loading: boolean
  error: string | null
}

export function OkrTab({ rows, loading, error }: OkrTabProps): React.JSX.Element {
  const [atRiskOnly, setAtRiskOnly] = useState(false)

  if (loading) {
    return (
      <section aria-label="OKR" className="flex items-center justify-center h-full text-muted text-sm">
        Loading…
      </section>
    )
  }

  if (error) {
    return (
      <section aria-label="OKR" className="flex flex-col items-center justify-center h-full gap-2">
        <div role="alert" className="text-danger text-sm">
          {error}
        </div>
      </section>
    )
  }

  const visible = atRiskOnly ? rows.filter((r) => r.status === 'at-risk') : rows

  return (
    <section aria-label="OKR" className="flex flex-col gap-4 p-4 h-full overflow-auto">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Key Results by epic</h2>
          <p className="text-xs text-muted">The same rows `agf okr` prints — one reader, two surfaces.</p>
        </div>
        <button
          role="switch"
          aria-checked={atRiskOnly}
          aria-label="At-risk only"
          onClick={() => setAtRiskOnly((v) => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
            atRiskOnly ? 'bg-danger/10 text-danger border-danger/30' : 'bg-surface-alt text-muted border-edge'
          }`}
        >
          At-risk only
        </button>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No epic declares a key result yet — run <code>agf okr set &lt;epicId&gt;</code> to declare one.
        </p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-muted text-left border-b border-edge">
              <th className="py-2 font-medium">Objective</th>
              <th className="py-2 font-medium">Current</th>
              <th className="py-2 font-medium">Target</th>
              <th className="py-2 font-medium">Attainment</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.epicId} data-testid={`okr-row-${row.epicId}`} className="border-b border-edge/50">
                <td className="py-2 pr-4 text-foreground">{row.objective}</td>
                <td className="py-2 pr-4 text-muted">{row.current ?? '—'}</td>
                <td className="py-2 pr-4 text-muted">{row.target ?? '—'}</td>
                <td className="py-2 pr-4 text-foreground font-medium">{formatAttainment(row.attainment)}</td>
                <td className="py-2">
                  {/* O `reason` do backend vira o title: o porquê do status fica
                      a um hover de distância, em vez de virar folclore. */}
                  <span
                    title={row.reason}
                    className={`px-2 py-0.5 rounded-md border text-[11px] ${STATUS_STYLES[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** Container: busca o relatório e entrega as linhas prontas à tabela. */
export function OkrTabContainer(): React.JSX.Element {
  const [report, setReport] = useState<OkrReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiClient
      .getOkr()
      .then((result) => {
        if (!cancelled) {
          setReport(result)
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

  return <OkrTab rows={report?.rows ?? []} loading={loading} error={error} />
}
