/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-security — Security audit: OWASP, npm audit, secrets, dependencies.
 * No MCP dependency. Operates directly against SqliteStore + FS.
 * Extends AuditBaseHandler.
 */

import { AuditBaseHandler } from './audit-base-handler.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-security.ts' })

export class GraphSecurityHandler extends AuditBaseHandler {
  async run(_args: string): Promise<string> {
    this.header('graph-security')

    this.step(1, 3, 'Rodando npm audit...')
    try {
      const { execSync } = await import('node:child_process')
      const output = execSync('npm audit --json 2>/dev/null || true', { timeout: 30000, cwd: this.dir })
      try {
        const audit = JSON.parse(output.toString())
        const vulns = audit.vulnerabilities ?? {}
        const total = Object.values(vulns as Record<string, { severity: string }>).length
        const critical = Object.values(vulns as Record<string, { severity: string }>).filter(
          (v) => v.severity === 'critical',
        ).length
        const high = Object.values(vulns as Record<string, { severity: string }>).filter(
          (v) => v.severity === 'high',
        ).length
        this.lines.push(`npm audit: ${total} vulnerabilidades · ${critical} críticas · ${high} altas`)
        if (critical > 0 || high > 0) {
          this.lines.push("  ⚠ Execute 'npm audit fix' para corrigir")
        } else {
          this.lines.push('  ✓ Sem vulnerabilidades críticas/altas')
        }
      } catch {
        this.lines.push('  npm audit: formato JSON não parseável')
      }
    } catch {
      this.lines.push('  npm audit: indisponível')
    }

    this.step(2, 3, 'Escaneando segredos no código...')
    try {
      const { execSync } = await import('node:child_process')
      const grepOut = execSync(
        `rg -l --include "*.ts" --include "*.js" --include "*.json" -e "(?i)(api.?key|secret|password|token|auth.*token)\\s*[:=]\\s*['"'][^'"]+['"]" src/ 2>/dev/null || true`,
        { timeout: 15000, cwd: this.dir },
      )
      const matches = grepOut.toString().trim().split('\n').filter(Boolean)
      if (matches.length > 0) {
        this.lines.push(`⚠ Possíveis segredos em ${matches.length} arquivo(s):`)
        for (const m of matches.slice(0, 5)) this.lines.push(`  • ${m}`)
      } else {
        this.lines.push('✓ Nenhum segredo óbvio detectado')
      }
    } catch {
      this.lines.push('  Scan de segredos: indisponível (rg necessário)')
    }

    this.step(3, 3, 'Verificando dependências do grafo...')
    const deps = this.store.getAllEdges().filter((e) => e.relationType === 'depends_on')
    const brokenDeps = deps.filter((d) => !this.store.getNodeById(d.to))
    if (brokenDeps.length > 0) {
      this.lines.push(`⚠ ${brokenDeps.length} dependência(s) quebrada(s) no grafo`)
    } else {
      this.lines.push('✓ Dependências do grafo consistentes')
    }

    return this.footer()
  }
}
