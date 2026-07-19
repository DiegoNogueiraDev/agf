import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/widgets/gauge.ts' })

const FILL = '█'
const EMPTY = '░'

export interface GaugeOptions {
  width?: number
  label?: string
}

/** Renders a percentage value as a horizontal progress bar using Unicode block characters. */
export function gauge(value: number, options: GaugeOptions = {}): string {
  log.debug(`gauge: ${value}%`)
  const width = options.width ?? 20
  const clamped = Math.max(0, Math.min(100, value))
  const filled = Math.round((clamped / 100) * width)
  const empty = width - filled
  const bar = FILL.repeat(filled) + EMPTY.repeat(empty)
  const label = options.label ? `${options.label} ` : ''
  return `${label}[${bar}] ${Math.round(clamped)}%`
}
