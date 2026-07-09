/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Line-delimited JSON framing for the daemon ↔ stdio-proxy channel.
 *
 * Every frame is `JSON.stringify(message) + "\n"`. `JSON.stringify` escapes
 * any newline inside string values (`\n` → `\\n`), so the trailing `\n`
 * unambiguously terminates each frame.
 *
 * We deliberately avoid Content-Length framing (LSP-style) because the
 * payloads are already JSON and the extra state machine is not worth the
 * debuggability cost — NDJSON streams can be inspected with plain tools.
 */

import { McpGraphError } from '../utils/errors.js'

/** Encode a message as a single NDJSON frame. */
export function encodeFrame(message: unknown): string {
  return JSON.stringify(message) + '\n'
}

/**
 * Streaming decoder: accumulates text chunks and yields fully-received frames.
 * Designed for `net.Socket` where `data` events arrive in arbitrary chunk sizes.
 */
export class FrameBuffer {
  private buffer = ''

  /**
   * Consume a chunk (any partial or multi-message payload). Returns every
   * complete frame parsed from the accumulated buffer, in order. Throws
   * `McpGraphError` if a frame is not valid JSON — the caller is expected to
   * terminate the connection and call `reset()` before reuse.
   */
  feed(chunk: string): unknown[] {
    this.buffer += chunk
    const messages: unknown[] = []

    let newlineIndex: number
    while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newlineIndex)
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (line.length === 0) continue
      try {
        messages.push(JSON.parse(line))
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        throw new McpGraphError(`Invalid JSON frame (${detail}): ${line.slice(0, 80)}`)
      }
    }

    return messages
  }

  /** Inspect the unparsed remainder (diagnostic use only). */
  pending(): string {
    return this.buffer
  }

  /** Drop any buffered data — call after a protocol error or socket reset. */
  reset(): void {
    this.buffer = ''
  }
}
