/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { RealHumanGateService } from '../../core/services/human-gate.js'
import { createCliOutput } from '../shared/cli-output.js'

/** Builds the `agf question` CLI command (Commander definition). */
export function questionCommand(): Command {
  const cmd = new Command('question').description(
    'Human-in-the-loop question lifecycle (ask → reply/reject → list) via HumanGateService',
  )

  cmd
    .command('ask <text>')
    .description('Ask a question, optionally reply or reject it in the same call, and return the full lifecycle')
    .option('--reply <answer>', 'Answer the question with this text')
    .option('--reject [reason]', 'Reject the question instead of answering')
    .action((text: string, opts: { reply?: string; reject?: string | boolean }) => {
      const out = createCliOutput('question.ask')
      const service = new RealHumanGateService()
      const question = service.ask(text)

      let resolved = question
      if (opts.reject) {
        const reason = typeof opts.reject === 'string' ? opts.reject : undefined
        resolved = service.reject(question.id, reason) ?? question
      } else if (opts.reply) {
        resolved = service.reply(question.id, opts.reply) ?? question
      }

      out.ok({ question: resolved, all: service.list() })
    })

  return cmd
}
