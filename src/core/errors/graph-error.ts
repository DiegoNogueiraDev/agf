/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-typed-errors — Typed error base class with structured context.
 */
export class GraphError extends Error {
  public readonly context: Record<string, unknown>

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message)
    this.name = 'GraphError'
    this.context = { ...context }
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
