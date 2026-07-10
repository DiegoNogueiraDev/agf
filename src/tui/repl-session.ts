/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-repl-cmd — Interactive REPL session state.
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/repl-session.ts' })

export class ReplSession {
  private history: string[] = []
  private maxHistory: number
  prompt: string = '›› '

  constructor(maxHistory = 100) {
    log.info(`ReplSession created, maxHistory=${maxHistory}`)
    this.maxHistory = maxHistory
  }

  addToHistory(command: string): void {
    this.history.push(command)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory)
    }
  }

  getHistory(): string[] {
    return [...this.history]
  }

  clear(): void {
    this.history = []
  }

  setPrompt(prompt: string): void {
    this.prompt = prompt
  }
}
