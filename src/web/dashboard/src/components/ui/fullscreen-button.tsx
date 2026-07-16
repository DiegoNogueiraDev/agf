/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo, useCallback, useEffect } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { FULLSCREEN_SHORTCUT } from '../../hooks/use-fullscreen'

interface FullscreenButtonProps {
  containerRef: React.RefObject<HTMLElement | null>
  tabName: string
  /** Shared fullscreen state — lifted to the parent so FullscreenOverlay stays in
   * sync. Each component calling its own useFullscreen() would hold independent
   * state that never syncs in the CSS-fallback path (no native Fullscreen API). */
  isFullscreen: boolean
  toggleFullscreen: (ref: React.RefObject<HTMLElement | null>) => Promise<void>
}

/**
 * Reusable fullscreen toggle button.
 * - Maximize2 icon when not fullscreen, Minimize2 when fullscreen
 * - Dynamic aria-label
 * - Positioned absolute top-right by the parent container
 * - Keyboard shortcut: Cmd+Shift+F / Ctrl+Shift+F
 */
export const FullscreenButton = memo(function FullscreenButton({
  containerRef,
  tabName,
  isFullscreen,
  toggleFullscreen,
}: FullscreenButtonProps) {
  const handleClick = useCallback(() => {
    void toggleFullscreen(containerRef)
  }, [toggleFullscreen, containerRef])

  // Keyboard shortcut: Cmd+Shift+F (Mac) / Ctrl+Shift+F (Win)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        void toggleFullscreen(containerRef)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleFullscreen, containerRef])

  const label = isFullscreen ? `Exit fullscreen (${tabName})` : `Enter fullscreen (${tabName})`

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={`${isFullscreen ? 'Exit' : 'Enter'} fullscreen (${FULLSCREEN_SHORTCUT})`}
      className="
        p-1.5 rounded-lg
        text-muted hover:text-foreground
        hover:bg-surface-elevated
        transition-colors duration-150
      "
    >
      {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
    </button>
  )
})
