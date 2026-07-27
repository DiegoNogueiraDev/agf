import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/browser-events.ts' })

export interface BrowserEvent {
  action: string
  args: string
  result: string
  durationMs: number
  sessionId: string
  at: number
}

const MAX_EVENTS = 500
const events: BrowserEvent[] = []

/** Appends a browser automation event to the in-memory ring buffer (capped at MAX_EVENTS). */
export function emitBrowserEvent(event: Omit<BrowserEvent, 'at'>): void {
  log.debug(`emitBrowserEvent: ${event.action}`)
  events.push({ ...event, at: Date.now() })
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
}

/** Returns all buffered browser events, optionally filtered by a substring match on action, args, or result. */
export function listBrowserEvents(filter?: string): BrowserEvent[] {
  if (!filter) return [...events]
  return events.filter((e) => e.action.includes(filter) || e.args.includes(filter) || e.result.includes(filter))
}

/** Empties the browser event ring buffer. */
export function clearBrowserEvents(): void {
  events.length = 0
}
