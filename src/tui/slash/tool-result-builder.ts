/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * ToolResultBuilder — builder pattern for tool output with char/line limits,
 * truncation, error context via tail(), and typed DisplayBlock output for UI.
 */
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/slash/tool-result-builder.ts' })

export type DisplayBlockType = 'text' | 'error' | 'data'

export interface DisplayBlock {
  type: DisplayBlockType
  content?: string
  data?: unknown
}

interface BuilderOptions {
  charLimit?: number
  lineLimit?: number
}

interface ErrorContext {
  stderr?: string
  exitCode?: number
}

const DEFAULT_CHAR_LIMIT = 100_000
const DEFAULT_LINE_LIMIT = 1000
const TRUNCATION_MARKER = '...'

export class ToolResultBuilder {
  readonly charLimit: number
  readonly lineLimit: number

  private type: DisplayBlockType = 'text'
  private content: string = ''
  private dataValue: unknown = undefined
  private extrasList: string[] = []

  constructor(options: BuilderOptions = {}) {
    log.debug('ToolResultBuilder created')
    this.charLimit = options.charLimit ?? DEFAULT_CHAR_LIMIT
    this.lineLimit = options.lineLimit ?? DEFAULT_LINE_LIMIT
  }

  text(content: string): this {
    this.type = 'text'
    this.content = content
    this.dataValue = undefined
    return this
  }

  error(content: string, ctx?: ErrorContext): this {
    this.type = 'error'
    const parts: string[] = [content]
    if (ctx?.stderr) {
      parts.push(`\nstderr:\n${ctx.stderr}`)
    }
    if (ctx?.exitCode !== undefined) {
      parts.push(`\nexit code: ${ctx.exitCode}`)
    }
    this.content = parts.join('')
    this.dataValue = undefined
    return this
  }

  data(value: unknown): this {
    this.type = 'data'
    this.dataValue = value
    this.content = ''
    return this
  }

  /** Return the last N lines of the content. Preserves line endings. */
  tail(lines: number): this {
    const lineArray = this.content.split('\n')
    this.content = lineArray.slice(-lines).join('\n')
    return this
  }

  /** Append additional context lines to the output. */
  extras(lines: string[]): this {
    this.extrasList.push(...lines)
    return this
  }

  /** Build and return a typed DisplayBlock. */
  display(): DisplayBlock {
    if (this.type === 'data') {
      return { type: 'data', data: this.dataValue }
    }
    let output = this.truncate(this.content)
    if (this.extrasList.length > 0) {
      output += '\n' + this.extrasList.join('\n')
    }
    return { type: this.type, content: output }
  }

  private truncate(text: string): string {
    // line limit first (preserves line endings)
    let result = this.truncateLines(text)
    // then char limit
    result = this.truncateChars(result)
    return result
  }

  private truncateLines(text: string): string {
    const lines = text.split('\n')
    if (lines.length <= this.lineLimit) return text
    return lines.slice(0, this.lineLimit).join('\n') + `\n${TRUNCATION_MARKER}`
  }

  private truncateChars(text: string): string {
    if (text.length <= this.charLimit) return text
    return text.slice(0, this.charLimit) + TRUNCATION_MARKER
  }
}
