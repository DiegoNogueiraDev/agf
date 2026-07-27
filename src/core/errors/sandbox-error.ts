/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-typed-errors — Sandbox execution error with structured context.
 */
import { GraphError } from './graph-error.js'

export class SandboxError extends GraphError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context)
    this.name = 'SandboxError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
