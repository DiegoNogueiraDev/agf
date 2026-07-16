/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Breadcrumb — renders `Group > Tab > [context]` for the two-tab dashboard.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Breadcrumb } from './breadcrumb'

describe('<Breadcrumb>', () => {
  it('renders the group label + tab label for the Graph tab', () => {
    render(<Breadcrumb activeTab="graph" tabLabel="Graph" onTabChange={vi.fn()} />)
    expect(screen.getByText('Visualize')).toBeInTheDocument()
    expect(screen.getByText('Graph')).toBeInTheDocument()
  })

  it('renders the group label + tab label for the Economy tab', () => {
    render(<Breadcrumb activeTab="economy" tabLabel="Economy" onTabChange={vi.fn()} />)
    expect(screen.getByText('Visualize')).toBeInTheDocument()
    expect(screen.getByText('Economy')).toBeInTheDocument()
  })

  it('renders a context segment when the context prop is provided', () => {
    render(<Breadcrumb activeTab="graph" tabLabel="Graph" onTabChange={vi.fn()} context="node-42" />)
    expect(screen.getByText('node-42')).toBeInTheDocument()
  })

  it("clicking the group segment navigates to the group's first tab", async () => {
    const onTabChange = vi.fn()
    const user = userEvent.setup()
    render(<Breadcrumb activeTab="economy" tabLabel="Economy" onTabChange={onTabChange} />)
    await user.click(screen.getByText('Visualize'))
    expect(onTabChange).toHaveBeenCalledWith('graph')
  })

  it('clicking the tab segment navigates to the active tab', async () => {
    const onTabChange = vi.fn()
    const user = userEvent.setup()
    render(<Breadcrumb activeTab="economy" tabLabel="Economy" onTabChange={onTabChange} />)
    await user.click(screen.getByText('Economy'))
    expect(onTabChange).toHaveBeenCalledWith('economy')
  })
})
