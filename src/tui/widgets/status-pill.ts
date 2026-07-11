import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/widgets/status-pill.ts' })

const STATUS_MAP: Record<string, { icon: string; color: string }> = {
  done: { icon: '✔', color: 'green' },
  in_progress: { icon: '●', color: 'blue' },
  blocked: { icon: '✘', color: 'red' },
  backlog: { icon: '○', color: 'gray' },
  ready: { icon: '●', color: 'yellow' },
}

/** Formats a node status string as a coloured label pill (e.g. "● done" in green). */
export function statusPill(status: string): string {
  log.debug(`statusPill: ${status}`)
  const entry = STATUS_MAP[status]
  if (!entry) return `[${status}]`
  return `${entry.icon} ${status}`
}
