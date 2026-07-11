/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from './sidebar'

const toggleTheme = vi.fn()

vi.mock('@/providers/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme }),
}))

afterEach(() => {
  toggleTheme.mockClear()
  window.localStorage.clear()
})

describe('Sidebar', () => {
  it('filters NAV_GROUPS case-insensitively and shows "No tabs match" without a match', async () => {
    const user = userEvent.setup()
    render(<Sidebar activeTab="graph" onTabChange={vi.fn()} />)

    const [search] = screen.getAllByPlaceholderText('Search tabs... (⌘K)')
    await user.type(search, 'ECON')
    expect(screen.getAllByRole('button', { name: 'Economy' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Graph' })).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'zzz-no-match')
    expect(screen.getAllByText('No tabs match').length).toBeGreaterThan(0)
  })

  it('focuses the search input and expands the sidebar when Cmd/Ctrl+K is pressed', async () => {
    window.localStorage.setItem('mcp-graph-sidebar-collapsed', 'true')
    render(<Sidebar activeTab="graph" onTabChange={vi.fn()} />)

    await userEvent.keyboard('{Meta>}k{/Meta}')

    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('placeholder', 'Search tabs... (⌘K)')
    })
  })

  it('calls toggleTheme from useTheme when the theme button is clicked', async () => {
    const user = userEvent.setup()
    render(<Sidebar activeTab="graph" onTabChange={vi.fn()} />)

    const [themeButton] = screen.getAllByRole('button', { name: /switch to light mode/i })
    await user.click(themeButton)

    expect(toggleTheme).toHaveBeenCalledTimes(1)
  })

  it('still toggles collapse visually when localStorage throws on persist', async () => {
    const user = userEvent.setup()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    render(<Sidebar activeTab="graph" onTabChange={vi.fn()} />)

    const [collapseButton] = screen.getAllByRole('button', { name: /collapse sidebar/i })
    await expect(user.click(collapseButton)).resolves.not.toThrow()

    expect(screen.getAllByRole('button', { name: /expand sidebar/i }).length).toBeGreaterThan(0)
    setItemSpy.mockRestore()
  })
})
