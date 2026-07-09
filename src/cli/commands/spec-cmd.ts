/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { getSpecTemplate, listSpecTemplates } from '../../core/spec-templates/built-in-spec-templates.js'
import {
  generateSpecDocument,
  validateSpecDocument,
  type ValidationResult,
} from '../../core/spec-templates/spec-template-engine.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { errMessage } from '../shared/coerce.js'

const log = createLogger({ layer: 'cli', source: 'spec-cmd.ts' })

export function listSpecTemplateLines(): string[] {
  return listSpecTemplates().map(
    (t) => `${t.name.padEnd(28)} [${t.phase.padEnd(9)}] ${t.sectionCount} seções — ${t.description}`,
  )
}

export function generateSpec(templateName: string, variables: Record<string, unknown> = {}): string | null {
  const template = getSpecTemplate(templateName)
  if (!template) return null
  return generateSpecDocument(template, variables)
}

export function validateSpec(content: string, templateName: string): ValidationResult | null {
  const template = getSpecTemplate(templateName)
  if (!template) return null
  return validateSpecDocument(content, template)
}

/** Builds the `agf spec` CLI command (Commander definition). */
export function specCommand(): Command {
  log.info('spec command registered')
  return new Command('spec')
    .description('Spec generation and validation (generate, validate, list-templates)')
    .option('-d, --dir <dir>', 'Diretório do projeto (aceito por uniformidade; spec não usa o grafo)', process.cwd())
    .option('--list-templates', 'List available spec templates')
    .option('--generate <template>', 'Generate a spec from a template')
    .option('--validate <file>', 'Validate a spec file against a template')
    .option('--template <name>', 'Template name to validate against (com --validate)')
    .option('--project <name>', 'Project name variable (com --generate)')
    .option('--out <file>', 'Write generated spec to a file instead of stdout')
    .action((opts: Record<string, string | boolean>) => {
      const out = createCliOutput('spec')

      if (opts['listTemplates']) {
        const templates = listSpecTemplates().map((t) => ({
          name: t.name,
          phase: t.phase,
          sectionCount: t.sectionCount,
          description: t.description,
        }))
        out.ok({ templates })
        return
      }
      if (typeof opts.generate === 'string') {
        const vars: Record<string, unknown> = {}
        if (typeof opts.project === 'string') vars.projectName = opts.project
        const doc = generateSpec(opts.generate, vars)
        if (doc === null) {
          out.err('INVALID_INPUT', `Template desconhecido: ${opts.generate}. Use --list-templates.`)
          return
        }
        if (typeof opts.out === 'string') {
          try {
            writeFileSync(opts.out, doc, 'utf8')
          } catch (e) {
            out.err('WRITE_FAILED', `Não foi possível gravar em ${opts.out}: ${errMessage(e)}`)
            return
          }
          out.ok({ template: opts.generate, file: opts.out, lineCount: doc.split('\n').length, content: doc })
        } else {
          out.ok({ template: opts.generate, content: doc })
        }
        return
      }
      if (typeof opts.validate === 'string') {
        if (typeof opts.template !== 'string') {
          out.err('INVALID_INPUT', 'Validação requer --template <name>. Use --list-templates para os nomes.')
          return
        }
        let content: string
        try {
          content = readFileSync(opts.validate, 'utf8')
        } catch {
          out.err('FILE_READ_ERROR', `Não foi possível ler o arquivo: ${opts.validate}`)
          return
        }
        const result = validateSpec(content, opts.template)
        if (result === null) {
          out.err('INVALID_INPUT', `Template desconhecido: ${opts.template}. Use --list-templates.`)
          return
        }
        if (result.valid) {
          out.ok({ file: opts.validate, template: opts.template, valid: true, warnings: result.warnings })
        } else {
          out.fail('VALIDATION_FAILED', `Spec "${opts.validate}" is invalid against ${opts.template}`, {
            file: opts.validate,
            template: opts.template,
            valid: false,
            missing: result.missing,
            warnings: result.warnings,
          })
        }
        return
      }
      out.err(
        'INVALID_INPUT',
        'Spec toolkit. Use --list-templates, --generate <template>, ou --validate <file> --template <name>.',
      )
    })
}
