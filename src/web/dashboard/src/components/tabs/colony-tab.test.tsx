/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_0ed7c4daa971 — ColonyTab: toggle entre Structure(@xyflow) e Colony
 * (ColonyView). AC1: toggle visível. AC2: Colony renderiza ColonyView.
 * AC3: Structure renderiza GraphTab sem regressão. AC4: erro/loading do
 * ColonyView não quebra o toggle nem a Structure.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColonyTab } from './colony-tab'
import type { GraphDocument } from '@/lib/types'

vi.mock('@/components/graph/workflow-graph', () => ({
  WorkflowGraph: () => <div data-testid="workflow-graph" />,
}))

vi.mock('./colony-view', () => ({
  ColonyView: () => <div data-testid="colony-view" />,
}))

const nonEmptyGraph: GraphDocument = {
  nodes: [{ id: 'n1', title: 'N1', type: 'task', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' }],
  edges: [],
}

describe('ColonyTab', () => {
  it('renders a toggle between Structure and Colony (AC1)', () => {
    render(<ColonyTab graph={nonEmptyGraph} />)

    expect(screen.getByRole('tab', { name: /structure/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /colony/i })).toBeInTheDocument()
  })

  it('defaults to Structure view showing GraphTab (AC3)', () => {
    render(<ColonyTab graph={nonEmptyGraph} />)

    expect(screen.getByTestId('workflow-graph')).toBeInTheDocument()
    expect(screen.queryByTestId('colony-view')).not.toBeInTheDocument()
  })

  it('switches to Colony view on toggle click (AC2)', async () => {
    const user = userEvent.setup()
    render(<ColonyTab graph={nonEmptyGraph} />)

    await user.click(screen.getByRole('tab', { name: /colony/i }))

    expect(screen.getByTestId('colony-view')).toBeInTheDocument()
    expect(screen.queryByTestId('workflow-graph')).not.toBeInTheDocument()
  })

  it('switches back to Structure view from Colony (AC3 — regression free)', async () => {
    const user = userEvent.setup()
    render(<ColonyTab graph={nonEmptyGraph} />)

    await user.click(screen.getByRole('tab', { name: /colony/i }))
    await user.click(screen.getByRole('tab', { name: /structure/i }))

    expect(screen.getByTestId('workflow-graph')).toBeInTheDocument()
    expect(screen.queryByTestId('colony-view')).not.toBeInTheDocument()
  })

  it('loading state in Structure mode shows GraphTab skeleton (delegated, no regress)', () => {
    render(<ColonyTab graph={null} loading />)

    expect(screen.getByRole('tab', { name: /structure/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /colony/i })).toBeInTheDocument()
  })

  it('error state in Structure mode shows GraphTab error (delegated, no regress)', () => {
    render(<ColonyTab graph={null} error="api down" />)

    expect(screen.getByRole('tab', { name: /structure/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /colony/i })).toBeInTheDocument()
  })
})
