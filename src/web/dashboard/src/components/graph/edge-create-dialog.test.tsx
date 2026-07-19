/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EdgeCreateDialog } from './edge-create-dialog'

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    createEdge: vi.fn(),
  },
}))

describe('EdgeCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('associa cada label ao seu controle — a11y (node_73f4e2df31a8)', () => {
    render(<EdgeCreateDialog fromId="node_1" toId="node_2" onCreated={vi.fn()} onCancel={vi.fn()} />)
    // getByLabelText só encontra o controle se label htmlFor↔id estiver pareado.
    expect(screen.getByLabelText('Relation Type').tagName).toBe('SELECT')
    expect(screen.getByLabelText('Reason (optional)').tagName).toBe('INPUT')
  })

  it('calls apiClient.createEdge with the correct payload and onCreated when Create is clicked', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.createEdge).mockResolvedValue({} as never)
    const onCreated = vi.fn()
    const user = userEvent.setup()

    render(<EdgeCreateDialog fromId="node_1" toId="node_2" onCreated={onCreated} onCancel={vi.fn()} />)

    await user.selectOptions(screen.getByRole('combobox'), 'blocks')
    await user.type(screen.getByPlaceholderText('Why this relationship exists...'), 'because it blocks')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(apiClient.createEdge).toHaveBeenCalledWith({
      from: 'node_1',
      to: 'node_2',
      relationType: 'blocks',
      reason: 'because it blocks',
    })
  })

  it('shows an error message and does not close when createEdge rejects', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.createEdge).mockRejectedValue(new Error('server exploded'))
    const onCreated = vi.fn()
    const user = userEvent.setup()

    render(<EdgeCreateDialog fromId="node_1" toId="node_2" onCreated={onCreated} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('server exploded')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('calls onCancel and makes no API call when Cancel is clicked', async () => {
    const { apiClient } = await import('@/lib/api-client')
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<EdgeCreateDialog fromId="node_1" toId="node_2" onCreated={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(apiClient.createEdge).not.toHaveBeenCalled()
  })
})
