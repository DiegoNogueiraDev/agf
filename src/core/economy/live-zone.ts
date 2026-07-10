/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export interface LiveZone {
  frozenEnd: number
  liveStart: number
}

/** Identify the boundary between frozen (cached) and live messages in a conversation array. */
export function getLiveZone(messages: unknown[]): LiveZone {
  if (messages.length === 0) {
    return { frozenEnd: 0, liveStart: 0 }
  }

  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>
    if (msg.role === 'user') {
      lastUserIdx = i
      break
    }
  }

  if (lastUserIdx === -1) {
    return { frozenEnd: 0, liveStart: 0 }
  }

  return {
    frozenEnd: lastUserIdx,
    liveStart: lastUserIdx,
  }
}
