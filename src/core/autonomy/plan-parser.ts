/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Parser da resposta do modelo → `ImplementationPlan`. O modelo é instruído a
 * responder com um bloco ```json contendo `{ files: [{path, content}],
 * testCommand? }`. Aceita também JSON cru. Valida o shape com Zod e lança
 * `ExecutorError` em qualquer ambiguidade — o autopilot trata como falha de
 * implementação (retry/escala), nunca aplica algo malformado.
 */
import { z } from 'zod/v4'
import { ExecutorError, type ImplementationPlan } from './implementation-executor.js'

const FileWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

const EditOpSchema = z.object({
  path: z.string().min(1),
  oldString: z.string(), // "" permitido = criação
  newString: z.string(),
  replaceAll: z.boolean().optional(),
})

const PlanSchema = z
  .object({
    files: z.array(FileWriteSchema).optional(),
    edits: z.array(EditOpSchema).optional(),
    testCommand: z.string().min(1).optional(),
  })
  .refine((plan) => (plan.files?.length ?? 0) > 0 || (plan.edits?.length ?? 0) > 0, {
    message: 'plano deve conter ao menos um file ou edit',
  })

/** Extrai o primeiro bloco ```json (ou o primeiro objeto `{...}` cru). */
function extractJsonCandidate(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) return text.slice(start, end + 1)
  throw new ExecutorError('Resposta do modelo não contém um plano JSON.')
}

/** Converte a resposta textual do modelo num plano validado. */
export function parseImplementationPlan(text: string): ImplementationPlan {
  const candidate = extractJsonCandidate(text)

  let raw: unknown
  try {
    raw = JSON.parse(candidate)
  } catch {
    throw new ExecutorError('Plano JSON inválido (parse falhou).')
  }

  const parsed = PlanSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ExecutorError(`Plano com shape inválido: ${parsed.error.issues[0]?.message ?? 'desconhecido'}`)
  }
  return parsed.data
}
