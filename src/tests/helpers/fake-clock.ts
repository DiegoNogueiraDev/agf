/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakeClock — deterministic clock for testing.
 * Allows tests to control time without real delays.
 */

export class FakeClock {
  private currentMs: number

  constructor(initialMs: number = 1700000000000) {
    this.currentMs = initialMs
  }

  now(): number {
    return this.currentMs
  }

  nowISO(): string {
    return new Date(this.currentMs).toISOString()
  }

  advance(ms: number): void {
    this.currentMs += ms
  }

  set(timeMs: number): void {
    this.currentMs = timeMs
  }

  /** Create a fresh Date object at the current fake time. */
  date(): Date {
    return new Date(this.currentMs)
  }
}
