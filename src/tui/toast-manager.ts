/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_82763b80dce3 — Toast notification manager.
 *
 * Pure functions for managing toast notifications with auto-dismiss,
 * severity coloring, and max-visible cap.
 */

export type ToastSeverity = 'info' | 'warn' | 'error'

export interface Toast {
  id: string
  text: string
  severity: ToastSeverity
  createdAt: number
}

const MAX_VISIBLE = 5
let _idSeq = 0
let _toasts: Toast[] = []

function nextId(): string {
  return `toast_${++_idSeq}`
}

export const toastManager = {
  create(text: string, severity: ToastSeverity = 'info'): Toast {
    return { id: nextId(), text, severity, createdAt: Date.now() }
  },

  add(text: string, severity: ToastSeverity = 'info'): string {
    const t = this.create(text, severity)
    _toasts.push(t)
    return t.id
  },

  dismiss(id: string): void {
    _toasts = _toasts.filter((t) => t.id !== id)
  },

  clear(): void {
    _toasts = []
    _idSeq = 0
  },

  getAll(): Toast[] {
    return [..._toasts]
  },

  getVisible(): Toast[] {
    return [..._toasts].slice(-MAX_VISIBLE)
  },

  severityColor(severity: ToastSeverity): string {
    switch (severity) {
      case 'info':
        return 'green'
      case 'warn':
        return 'yellow'
      case 'error':
        return 'red'
    }
  },

  isExpired(toast: Toast, ttlMs: number): boolean {
    return Date.now() - toast.createdAt > ttlMs
  },

  /** For test isolation only. */
  _reset(): void {
    _toasts = []
    _idSeq = 0
  },
}
