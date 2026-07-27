/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-typed-errors — Agent driver error with structured context.
 */
import { GraphError } from './graph-error.js'

/** The stable envelope `code` an AgentDriverError surfaces to callers. */
export const AGENT_DRIVER_ERROR_CODE = 'AGENT_DRIVER_ERROR'

export class AgentDriverError extends GraphError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context)
    this.name = 'AgentDriverError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** True when `err` is an AgentDriverError. */
export function isAgentDriverError(err: unknown): err is AgentDriverError {
  return err instanceof AgentDriverError
}
