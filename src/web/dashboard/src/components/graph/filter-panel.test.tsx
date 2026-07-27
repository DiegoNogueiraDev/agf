/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterPanel } from './filter-panel'

const baseProps = {
  statuses: new Set<string>(),
  types: new Set<string>(),
  availableTypes: [{ type: 'task' as const, count: 3 }],
  direction: 'TB' as const,
  onStatusToggle: vi.fn(),
  onTypeToggle: vi.fn(),
  onDirectionChange: vi.fn(),
}

describe('FilterPanel', () => {
  it('calls onStatusToggle with the correct status when a status chip is clicked', async () => {
    const user = userEvent.setup()
    const onStatusToggle = vi.fn()
    render(<FilterPanel {...baseProps} onStatusToggle={onStatusToggle} />)

    await user.click(screen.getByRole('button', { name: /backlog/i }))

    expect(onStatusToggle).toHaveBeenCalledWith('backlog')
  })

  it('shows a "none" empty state instead of a list when availableTypes is empty', () => {
    render(<FilterPanel {...baseProps} availableTypes={[]} />)

    expect(screen.getByText('none')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /task/i })).not.toBeInTheDocument()
  })

  it('does not render the Sprint section when availableSprints is undefined', () => {
    render(<FilterPanel {...baseProps} availableSprints={undefined} />)

    expect(screen.queryByText('Sprint')).not.toBeInTheDocument()
  })
})
