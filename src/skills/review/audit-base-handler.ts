/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AuditBaseHandler — base class for audit/review skills (graph-review,
 * graph-security, graph-quality). Provides shared setup, progress reporting,
 * header/footer formatting, and elapsed time tracking. Reduces boilerplate
 * across the 3 audit handlers by ~10 lines each.
 */
import type { SkillHandlerPort, SkillExecutionContext, SkillStep } from '../../tui/skill-handler-port.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { fmtElapsed } from '../shared/handler-utils.js'

export abstract class AuditBaseHandler implements SkillHandlerPort {
  protected store!: SqliteStore
  protected dir!: string
  protected onProgress!: (step: SkillStep) => void
  protected startMs = 0
  protected lines: string[] = []

  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    this.store = ctx.store
    this.dir = ctx.dir
    this.onProgress = ctx.onProgress
    this.startMs = Date.now()
    this.lines = []
    return this.run(args)
  }

  protected abstract run(args: string): Promise<string>

  protected header(name: string): void {
    this.lines.push(`═ /${name} ═`)
  }

  protected footer(): string {
    this.lines.push(`═ ${fmtElapsed(Date.now() - this.startMs)} ═`)
    return this.lines.join('\n')
  }

  protected step(step: number, total: number, label: string): void {
    this.onProgress({
      step,
      total,
      label,
      elapsedMs: Date.now() - this.startMs,
      tokensUsed: 0,
    })
  }
}
