/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_b106e79b742f: FullscreenButton and FullscreenOverlay used to each call
 * their own useFullscreen(), so the overlay never appeared in the CSS-fallback
 * path (no native Fullscreen API) — the button's own state changed but the
 * overlay's separate hook instance never knew. Fixed by lifting useFullscreen()
 * to the shared parent and passing state/actions down as props.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { FullscreenButton } from './fullscreen-button'
import { FullscreenOverlay } from './fullscreen-overlay'
import { useFullscreen } from '../../hooks/use-fullscreen'

function Harness({ tabName = 'Graph' }: { tabName?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { isFullscreen, toggleFullscreen, exitFullscreen } = useFullscreen()
  return (
    <div ref={ref}>
      <FullscreenButton
        containerRef={ref}
        tabName={tabName}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
      />
      <FullscreenOverlay tabName={tabName} isFullscreen={isFullscreen} exitFullscreen={exitFullscreen} />
    </div>
  )
}

describe('<FullscreenOverlay> stays in sync with <FullscreenButton>', () => {
  it('is absent before entering fullscreen', () => {
    render(<Harness />)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('appears after the button is clicked (regression: used to require a shared hook instance)', async () => {
    const user = userEvent.setup()
    render(<Harness tabName="Graph" />)

    await user.click(screen.getByRole('button', { name: 'Enter fullscreen (Graph)' }))

    expect(await screen.findByRole('toolbar', { name: 'Graph fullscreen toolbar' })).toBeInTheDocument()
  })

  it('disappears again after clicking "Exit fullscreen" inside the overlay', async () => {
    const user = userEvent.setup()
    render(<Harness tabName="Graph" />)

    await user.click(screen.getByRole('button', { name: 'Enter fullscreen (Graph)' }))
    await screen.findByRole('toolbar')
    await user.click(screen.getByRole('button', { name: 'Exit fullscreen' }))

    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})
