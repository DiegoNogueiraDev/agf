/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { axe } from 'vitest-axe'
import { FullscreenButton } from './fullscreen-button'
import { useFullscreen } from '../../hooks/use-fullscreen'

function Harness({ tabName = 'graph' }: { tabName?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { isFullscreen, toggleFullscreen } = useFullscreen()
  return (
    <div ref={ref}>
      <FullscreenButton
        containerRef={ref}
        tabName={tabName}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}

describe('<FullscreenButton>', () => {
  it('renders with an "Enter fullscreen" label by default', () => {
    render(<Harness tabName="graph" />)
    expect(screen.getByRole('button', { name: 'Enter fullscreen (graph)' })).toBeInTheDocument()
  })

  it('toggles to "Exit fullscreen" after being clicked (CSS fallback, no native Fullscreen API in jsdom)', async () => {
    const user = userEvent.setup()
    render(<Harness tabName="metrics" />)

    await user.click(screen.getByRole('button', { name: 'Enter fullscreen (metrics)' }))

    expect(await screen.findByRole('button', { name: 'Exit fullscreen (metrics)' })).toBeInTheDocument()
  })

  it('includes the keyboard shortcut hint in the title attribute', () => {
    render(<Harness />)
    expect(screen.getByRole('button')).toHaveAttribute('title', expect.stringContaining('Cmd+Shift+F'))
  })

  it('has no accessibility violations (vitest-axe sample pattern)', async () => {
    const { container } = render(<Harness tabName="graph" />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('detects a real accessibility violation, proving the matcher actually checks (icon-only button with no accessible name)', async () => {
    const { container } = render(<button type="button" />)
    const results = await axe(container)
    expect(results.violations.length).toBeGreaterThan(0)
  })
})
