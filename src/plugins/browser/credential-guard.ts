/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 3.1: Injeção segura de credenciais.
 *
 * Guardas agf-side para flows de browser: (1) redação — nenhum valor de
 * credencial/cookie pode aparecer em log ou trilha de auditoria; (2) allowlist de
 * domínios — navegar para fora de `allowedDomains` é bloqueado (domain_blocked).
 * Os segredos são repassados ao `auth_state` do browser agent; aqui só protegemos.
 * Puro, determinístico — não-pivota (nenhuma execução de browser).
 */

import type { BrowserPilotErrorCode } from '../../schemas/browser-pilot.schema.js'

const REDACTED = '[REDACTED]'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Remove todos os valores de segredo de um texto (log/auditoria), trocando por
 * `[REDACTED]`. Segredos vazios/curtos demais (<3) são ignorados para não
 * mascarar texto trivial. Nunca lança.
 */
export function redactSecrets(text: string, secrets: ReadonlyArray<string>): string {
  let out = text
  for (const secret of secrets) {
    if (!secret || secret.length < 3) continue
    out = out.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED)
  }
  return out
}

export interface DomainCheck {
  allowed: boolean
  /** Presente quando bloqueado. */
  code?: BrowserPilotErrorCode
  host?: string
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    // Aceita "example.com/x" sem esquema.
    const m = url.match(/^([^/\s:]+\.[^/\s:]+)/)
    return m ? m[1].toLowerCase() : null
  }
}

/**
 * Verifica se uma URL pode ser navegada dada a allowlist. Allowlist vazia → sem
 * restrição (allowed). Host deve casar exatamente um domínio ou ser subdomínio
 * dele; caso contrário → bloqueado com `domain_blocked`.
 */
export function checkDomainAllowed(url: string, allowedDomains: ReadonlyArray<string>): DomainCheck {
  if (allowedDomains.length === 0) return { allowed: true }
  const host = hostOf(url)
  if (!host) return { allowed: false, code: 'domain_blocked' }
  const allowed = allowedDomains.some((d) => {
    const dom = d.toLowerCase()
    return host === dom || host.endsWith(`.${dom}`)
  })
  return allowed ? { allowed: true, host } : { allowed: false, code: 'domain_blocked', host }
}
