/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './theme-provider.js'

function ThemeReadout(): React.JSX.Element {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  )
}

describe('<ThemeProvider> + useTheme', () => {
  beforeEach(() => {
    // Clean slate for each test — ThemeProvider reads from localStorage on
    // mount and writes back on every change. jsdom's localStorage doesn't
    // expose clear() reliably, so target the key directly.
    localStorage.removeItem('mcp-graph-theme')
    document.body.classList.remove('dark')
  })

  it("should default to 'dark' theme when localStorage is empty", () => {
    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
  })

  it("should restore 'light' theme from localStorage", () => {
    localStorage.setItem('mcp-graph-theme', 'light')

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
  })

  it("should ignore invalid stored values and fall back to 'dark'", () => {
    localStorage.setItem('mcp-graph-theme', 'neon-pink-mode')

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
  })

  it("should add 'dark' class to body when theme is dark", () => {
    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    expect(document.body.classList.contains('dark')).toBe(true)
  })

  it("should remove 'dark' class from body when theme is light", () => {
    localStorage.setItem('mcp-graph-theme', 'light')

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    expect(document.body.classList.contains('dark')).toBe(false)
  })

  it('should toggle dark → light and persist to localStorage', async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')

    await user.click(screen.getByText('toggle'))

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
    expect(localStorage.getItem('mcp-graph-theme')).toBe('light')
    expect(document.body.classList.contains('dark')).toBe(false)
  })

  it('should toggle light → dark', async () => {
    const user = userEvent.setup()
    localStorage.setItem('mcp-graph-theme', 'light')

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')

    await user.click(screen.getByText('toggle'))

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    expect(localStorage.getItem('mcp-graph-theme')).toBe('dark')
  })

  it('should provide default values when useTheme is used outside provider', () => {
    // useTheme reads context which has a default — calling outside provider
    // shouldn't crash; toggle is a no-op.
    let captured: { theme: string } = { theme: '' }
    function CaptureOnly(): null {
      captured = useTheme()
      return null
    }

    render(<CaptureOnly />)

    // Default exported by createContext is { theme: "dark", toggleTheme: () => {} }
    expect(captured.theme).toBe('dark')
  })

  it('should not crash when toggle is called rapidly multiple times', async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    const button = screen.getByText('toggle')

    await act(async () => {
      await user.click(button)
      await user.click(button)
      await user.click(button)
    })

    // Three toggles from "dark" should land on "light".
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
  })
})
