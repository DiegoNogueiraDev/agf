/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Box, Text } from 'ink'
import { toastManager, type Toast, type ToastSeverity } from './toast-manager.js'

const TOAST_TTL = 5000
const CLEANUP_INTERVAL = 1000

export function ToastOverlay(): ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    const interval = setInterval(() => {
      const all = toastManager.getAll()
      const expired = all.filter((t) => toastManager.isExpired(t, TOAST_TTL))
      for (const t of expired) toastManager.dismiss(t.id)
      setToasts(toastManager.getVisible())
    }, CLEANUP_INTERVAL)
    return () => {
      mounted.current = false
      clearInterval(interval)
    }
  }, [])

  if (toasts.length === 0) return <Box />

  return (
    <Box flexDirection="column" marginTop={1}>
      {toasts.map((t) => (
        <Box key={t.id}>
          <Text color={toastManager.severityColor(t.severity)} bold>
            {'\u25cf'} {t.text}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

export function pushToast(text: string, severity: ToastSeverity = 'info'): string {
  return toastManager.add(text, severity)
}
export type { ToastSeverity } from './toast-manager.js'
