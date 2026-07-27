/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { useState, useCallback, useEffect, useRef } from 'react'

/** Keyboard shortcut label for fullscreen toggle */
export const FULLSCREEN_SHORTCUT = 'Cmd+Shift+F / Ctrl+Shift+F'

/** Check if the Fullscreen API is available in the current browser */
export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  return !!(document.fullscreenEnabled || (document as unknown as Record<string, unknown>).webkitFullscreenEnabled)
}

interface UseFullscreenReturn {
  isFullscreen: boolean
  enterFullscreen: (ref: React.RefObject<HTMLElement | null>) => Promise<void>
  exitFullscreen: () => Promise<void>
  toggleFullscreen: (ref: React.RefObject<HTMLElement | null>) => Promise<void>
}

/**
 * Hook for managing fullscreen state with native API + CSS fallback.
 *
 * - enterFullscreen(ref): uses requestFullscreen() with CSS fallback
 * - exitFullscreen(): uses document.exitFullscreen()
 * - isFullscreen: reactive boolean
 * - toggleFullscreen(ref): convenience method
 * - Keyboard: Cmd+Shift+F (Mac) / Ctrl+Shift+F (Win)
 * - Cleanup on unmount
 */
export function useFullscreen(): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fallbackRef = useRef<HTMLElement | null>(null)

  // Listen for native fullscreenchange events
  useEffect(() => {
    function handleChange(): void {
      const isFs = !!document.fullscreenElement
      setIsFullscreen(isFs)
      // If exited via ESC (native), clean up fallback state
      if (!isFs && fallbackRef.current) {
        fallbackRef.current.classList.remove('fullscreen-fallback')
        fallbackRef.current = null
      }
    }

    document.addEventListener('fullscreenchange', handleChange)
    document.addEventListener('webkitfullscreenchange', handleChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleChange)
      document.removeEventListener('webkitfullscreenchange', handleChange)
    }
  }, [])

  const enterFullscreen = useCallback(async (ref: React.RefObject<HTMLElement | null>) => {
    const el = ref.current
    if (!el) return

    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if ((el as unknown as Record<string, unknown>).webkitRequestFullscreen) {
        await (el as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen()
      } else {
        // CSS fallback: fixed inset-0 z-50
        el.classList.add('fullscreen-fallback')
        fallbackRef.current = el
        setIsFullscreen(true)
      }
    } catch {
      // Fallback if API fails (e.g., not triggered by user gesture)
      el.classList.add('fullscreen-fallback')
      fallbackRef.current = el
      setIsFullscreen(true)
    }
  }, [])

  const exitFullscreen = useCallback(async () => {
    // Clean up CSS fallback if active
    if (fallbackRef.current) {
      fallbackRef.current.classList.remove('fullscreen-fallback')
      fallbackRef.current = null
      setIsFullscreen(false)
      return
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if ((document as unknown as Record<string, unknown>).webkitFullscreenElement) {
        await (document as unknown as { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen()
      }
    } catch {
      setIsFullscreen(false)
    }
  }, [])

  const toggleFullscreen = useCallback(
    async (ref: React.RefObject<HTMLElement | null>) => {
      if (isFullscreen) {
        await exitFullscreen()
      } else {
        await enterFullscreen(ref)
      }
    },
    [isFullscreen, enterFullscreen, exitFullscreen],
  )

  // Keyboard shortcut: Cmd+Shift+F (Mac) / Ctrl+Shift+F (Win)
  // Note: The actual ref must be provided by the component using this hook.
  // This hook only provides the toggle function — the component binds the shortcut.

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fallbackRef.current) {
        fallbackRef.current.classList.remove('fullscreen-fallback')
        fallbackRef.current = null
      }
    }
  }, [])

  return { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen }
}
