/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Vitest setup for the dashboard React test surface.
 *
 * Loaded via vitest.config.ts → projects[name=dashboard] → setupFiles.
 * Runs before every test file in src/web/dashboard/src/**\/*.test.{ts,tsx}.
 *
 * Responsibilities:
 *  1. Register @testing-library/jest-dom matchers (.toBeInTheDocument, etc.)
 *  2. Polyfill browser APIs that jsdom does not implement but React Flow,
 *     Recharts, and Sigma all use at module-eval time.
 *  3. Auto-cleanup the DOM between tests so leaked render output cannot
 *     contaminate the next test.
 *  4. Register the vitest-axe toHaveNoViolations matcher for accessibility tests.
 */

/// <reference types="vitest-axe/extend-expect" />
import '@testing-library/jest-dom/vitest'
import { afterEach, expect } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as axeMatchers from 'vitest-axe/matchers'

// ── Accessibility matcher (toHaveNoViolations) ────────────
expect.extend(axeMatchers)

// ── DOM cleanup between tests ─────────────────────────────
afterEach(() => {
  cleanup()
})

// ── Browser API polyfills (missing in jsdom) ──────────────

// React Flow / @xyflow/react use ResizeObserver to track viewport changes.
// Without this polyfill, mounting any flow node throws.
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
}

// Some virtualization libraries (TanStack Virtual) probe IntersectionObserver
// during render. jsdom doesn't ship one.
class IntersectionObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  root: Element | Document | null = null
  rootMargin = ''
  thresholds: ReadonlyArray<number> = []
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver
}

// Tailwind responsive utilities and some hooks call window.matchMedia.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// Sigma + Recharts probe canvas during render. Stub getContext so React Flow
// node renderers don't crash.
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext
}

// requestAnimationFrame / cancelAnimationFrame are needed by some animation
// hooks; jsdom provides them but workers may not.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0)) as unknown as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as unknown as typeof cancelAnimationFrame
}

// jsdom ships a localStorage Object but its methods (getItem / setItem /
// removeItem / clear / length / key) sometimes go missing depending on the
// vitest pool / fork mode. Replace the global with a fully-functional Map-
// based shim so tests can read and write localStorage deterministically.
if (typeof globalThis.localStorage !== 'undefined') {
  const store = new Map<string, string>()
  const shim: Storage = {
    get length(): number {
      return store.size
    },
    clear(): void {
      store.clear()
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: shim,
    writable: true,
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      enumerable: true,
      value: shim,
      writable: true,
    })
  }
}
