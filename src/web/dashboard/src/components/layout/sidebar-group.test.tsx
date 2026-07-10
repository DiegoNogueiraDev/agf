/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GitFork, Coins, LayoutDashboard } from 'lucide-react'
import { SidebarGroup } from './sidebar-group'
import type { NavGroup } from './nav-config'

const group: NavGroup = {
  id: 'visualization',
  label: 'Visualize',
  icon: LayoutDashboard,
  items: [
    { id: 'graph', label: 'Graph', icon: GitFork },
    { id: 'economy', label: 'Economy', icon: Coins },
  ],
}

describe('SidebarGroup', () => {
  it('renders only icon buttons and no group header when collapsed', () => {
    render(<SidebarGroup group={group} activeTab="graph" collapsed onTabChange={vi.fn()} />)

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(group.items.length)
  })

  it('starts expanded automatically when activeTab is inside the group', () => {
    render(<SidebarGroup group={group} activeTab="economy" collapsed={false} onTabChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /visualize/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('calls onTabChange with the clicked item id', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<SidebarGroup group={group} activeTab="graph" collapsed={false} onTabChange={onTabChange} />)

    await user.click(screen.getByRole('button', { name: 'Economy' }))

    expect(onTabChange).toHaveBeenCalledWith('economy')
  })

  it('renders without throwing when group.items is empty', () => {
    const emptyGroup: NavGroup = { ...group, items: [] }
    render(<SidebarGroup group={emptyGroup} activeTab="graph" collapsed={false} onTabChange={vi.fn()} />)

    expect(screen.getByRole('group')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /graph|economy/i })).toHaveLength(0)
  })
})
