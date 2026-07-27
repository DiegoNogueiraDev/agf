import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/widgets/sparkline.ts' })

const BLOCKS = '▁▂▃▄▅▆▇█'

export interface SparklineOptions {
  width?: number
  min?: number
  max?: number
}

/** Renders a Unicode block-chart sparkline for a numeric data series. */
export function sparkline(data: number[], options: SparklineOptions = {}): string {
  log.debug(`sparkline: ${data.length} points`)
  if (data.length === 0) return ''
  const width = options.width ?? data.length
  const min = options.min ?? Math.min(...data)
  const max = options.max ?? Math.max(...data)
  const range = max - min || 1
  const result: string[] = []
  for (let i = 0; i < width; i++) {
    const idx = Math.floor((i / width) * data.length)
    const v = data[Math.min(idx, data.length - 1)]!
    const normalized = (v - min) / range
    const blockIdx = Math.min(BLOCKS.length - 1, Math.floor(normalized * BLOCKS.length))
    result.push(BLOCKS[Math.max(0, blockIdx)]!)
  }
  return result.join('')
}
