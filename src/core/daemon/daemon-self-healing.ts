/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-daemon-self-healing — Daemon failure diagnosis and self-repair.
 *
 * Padrão: diagnóstico e auto-reparo de daemon.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface DaemonFailure {
  message: string
  exitCode: number
}

export interface HealingRecipe {
  pattern: string
  fix: string
  action: 'restart' | 'rebuild' | 'reconfigure' | 'retry'
}

export interface ProactiveFix {
  pattern: string
  fix: string
  action: 'restart' | 'rebuild' | 'reconfigure' | 'retry'
  count: number
}

const KNOWN_FAILURES: HealingRecipe[] = [
  {
    pattern: 'EADDRINUSE|address already in use',
    fix: 'remove stale IPC socket file and restart daemon',
    action: 'restart',
  },
  {
    pattern: 'Cannot find module|MODULE_NOT_FOUND',
    fix: 'rebuild project (dist/ missing or stale)',
    action: 'rebuild',
  },
  {
    pattern: 'ECONNREFUSED.*proxy|proxy.*refused',
    fix: 'check proxy configuration and retry',
    action: 'reconfigure',
  },
  {
    pattern: 'ECONNRESET|connection reset',
    fix: 'retry connection with exponential backoff',
    action: 'retry',
  },
  {
    pattern: 'listen EACCES|EPERM|permission denied',
    fix: 'check file permissions on IPC socket directory',
    action: 'reconfigure',
  },
]

const LEARNING_FILE = 'learnings.json'

export class DaemonSelfHealer {
  private learnedFixes: HealingRecipe[] = []
  private occurrenceCount: Map<string, number> = new Map()
  private readonly learningPath: string | null

  constructor(learningPath?: string) {
    this.learningPath = learningPath ?? null
    if (this.learningPath) {
      this.loadLearnings()
    }
  }

  diagnose(failure: DaemonFailure): HealingRecipe | null {
    for (const recipe of KNOWN_FAILURES) {
      if (new RegExp(recipe.pattern, 'i').test(failure.message)) {
        return recipe
      }
    }
    return null
  }

  recordSuccess(recipe: HealingRecipe): void {
    if (!this.learnedFixes.some((f) => f.pattern === recipe.pattern)) {
      this.learnedFixes.push(recipe)
    }
    const prev = this.occurrenceCount.get(recipe.pattern) ?? 0
    this.occurrenceCount.set(recipe.pattern, prev + 1)
  }

  getLearnedFixes(): HealingRecipe[] {
    return [...this.learnedFixes]
  }

  getProactiveFixes(): ProactiveFix[] {
    const result: ProactiveFix[] = []
    for (const fix of this.learnedFixes) {
      const count = this.occurrenceCount.get(fix.pattern) ?? 0
      if (count >= 2) {
        result.push({ ...fix, count })
      }
    }
    return result
  }

  persistLearnings(): void {
    if (!this.learningPath) return
    const filePath = resolve(this.learningPath, LEARNING_FILE)
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const data = this.learnedFixes.map((f) => {
      const count = this.occurrenceCount.get(f.pattern) ?? 1
      return { ...f, count }
    })
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  private loadLearnings(): void {
    if (!this.learningPath) return
    const filePath = resolve(this.learningPath, LEARNING_FILE)
    if (!existsSync(filePath)) return
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Array<HealingRecipe & { count?: number }>
      for (const entry of data) {
        this.learnedFixes.push({ pattern: entry.pattern, fix: entry.fix, action: entry.action })
        this.occurrenceCount.set(entry.pattern, entry.count ?? 1)
      }
    } catch {
      // Corrupted learning file — start fresh
    }
  }
}
