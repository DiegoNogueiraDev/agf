/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_82db62c74056 — OkrTab: a superfície web do cockpit de OKR.
 *
 * A aba é apresentacional de propósito (o fetch mora em useOkrData), o que
 * permite testá-la com LINHAS REAIS — os mesmos objetos que GET /api/v1/okr
 * devolve — em vez de um dublê do cliente HTTP. O que se afirma aqui é o que
 * o dev VÊ: os mesmos campos que `agf okr` imprime, e o toggle at-risk
 * filtrando igual ao `--at-risk`.
 *
 * O caso que mais importa é o `no-data`: um KR sem fonte não pode aparecer
 * como 0% na tela. Zero é uma medição ruim; ausência de dado é outra coisa —
 * e confundir as duas é exatamente o falso-verde que a guarda de honestidade
 * do épico existe para impedir.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OkrTab } from './okr-tab'
import type { OkrRow } from '@/lib/types'

/** Linhas com o shape exato que a rota serve (verificado em okr-route.test.ts). */
const ROWS: OkrRow[] = [
  {
    epicId: 'node_on_track',
    objective: 'Cockpit de OKR operável',
    target: 100,
    current: 80,
    unit: 'percent',
    attainment: 0.8,
    status: 'on-track',
    provenance: 'metadata',
    reason: 'ritmo compatível com o alvo',
  },
  {
    epicId: 'node_at_risk',
    objective: 'Superfície de skills instalável',
    target: 100,
    current: 10,
    unit: 'percent',
    attainment: 0.1,
    status: 'at-risk',
    provenance: 'metadata',
    reason: 'ritmo abaixo do necessário para o prazo',
  },
  {
    epicId: 'node_no_data',
    objective: 'Épico sem KR declarado',
    target: null,
    current: null,
    unit: null,
    attainment: null,
    status: 'no-data',
    provenance: 'unset',
    reason: 'KR sem fonte estruturada (metadata.kr ausente ou não-numérico)',
  },
]

describe('OkrTab', () => {
  it('shows one row per epic with the same fields agf okr prints (AC1)', () => {
    render(<OkrTab rows={ROWS} loading={false} error={null} />)

    expect(screen.getByText('Cockpit de OKR operável')).toBeInTheDocument()
    expect(screen.getByText('Superfície de skills instalável')).toBeInTheDocument()
    // Atingimento renderizado como percentual — o número que o CLI mostra.
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
  })

  it('renders no-data as absence, NEVER as 0% (the honesty guard, on screen)', () => {
    render(<OkrTab rows={ROWS} loading={false} error={null} />)

    const row = screen.getByTestId('okr-row-node_no_data')
    expect(row).toHaveTextContent(/—|no data/i)
    // O falso-verde que este teste existe para barrar: um KR sem fonte pintado
    // como uma medição de zero.
    expect(row).not.toHaveTextContent('0%')
  })

  it('at-risk toggle narrows to what needs attention, like --at-risk (AC2)', async () => {
    const user = userEvent.setup()
    render(<OkrTab rows={ROWS} loading={false} error={null} />)

    await user.click(screen.getByRole('switch', { name: /at.risk/i }))

    expect(screen.getByText('Superfície de skills instalável')).toBeInTheDocument()
    expect(screen.queryByText('Cockpit de OKR operável')).not.toBeInTheDocument()
    expect(screen.queryByText('Épico sem KR declarado')).not.toBeInTheDocument()
  })

  it('an empty report reads as "no OKR declared", not as a failure', () => {
    render(<OkrTab rows={[]} loading={false} error={null} />)

    expect(screen.getByText(/no epic declares a key result/i)).toBeInTheDocument()
  })

  it('surfaces a load error instead of rendering a silently empty table', () => {
    render(<OkrTab rows={[]} loading={false} error="connection refused" />)

    expect(screen.getByText(/connection refused/i)).toBeInTheDocument()
  })
})
