/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Spec Template Engine — generate, validate, and parse spec documents.
 * ADR-08: sections with outputNodeType create typed nodes deterministically.
 */

import { createLogger } from '../utils/logger.js'
import type { SpecTemplate } from '../../schemas/spec-template.schema.js'

const log = createLogger({ layer: 'core', source: 'spec-template-engine.ts' })

export interface ConstitutionPrincipleRef {
  id: string
  title: string
  description: string
}

export interface ValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

function replaceVariable(text: string, key: string, value: unknown): string {
  return text.split(`{{${key}}}`).join(String(value))
}

/**
 * Generate a markdown spec document from a template + variables.
 * Replaces {{variable}} placeholders and optionally appends constitution principles.
 */
export function generateSpecDocument(
  template: SpecTemplate,
  variables: Record<string, unknown>,
  constitutionPrinciples?: ConstitutionPrincipleRef[],
): string {
  const lines: string[] = []

  // Title
  const projectName = String(variables.projectName ?? template.name)
  lines.push(`# ${template.phase}: ${projectName}`)
  lines.push('')

  // Sections
  for (const section of template.sections) {
    lines.push(`## ${section.title}`)
    lines.push('')

    if (section.placeholder) {
      let placeholder = section.placeholder
      // Replace variables in placeholders
      for (const [key, value] of Object.entries(variables)) {
        placeholder = replaceVariable(placeholder, key, value)
      }
      lines.push(placeholder)
    } else {
      lines.push(section.description)
    }

    lines.push('')
  }

  // Constitution principles (if template enables it and principles provided)
  if (template.constitution && constitutionPrinciples?.length) {
    lines.push('## Constitution Principles')
    lines.push('')
    for (const principle of constitutionPrinciples) {
      lines.push(`- **${principle.title}**: ${principle.description}`)
    }
    lines.push('')
  }

  // Replace any remaining variables in the full document
  let resultValue = lines.join('\n')
  for (const [key, value] of Object.entries(variables)) {
    resultValue = replaceVariable(resultValue, key, value)
  }

  return resultValue
}

/**
 * Validate a markdown document against a spec template.
 * Checks for required sections and validation rules.
 */
export function validateSpecDocument(content: string, template: SpecTemplate): ValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  // Extract section headings from content (## Title)
  const headingPattern = /^##\s+(.+)$/gm
  const foundSections = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(content)) !== null) {
    foundSections.add(match[1].trim())
  }

  // Check required sections
  for (const section of template.sections) {
    if (section.required && !foundSections.has(section.title)) {
      missing.push(section.title)
    }
  }

  // Check validation rules on found sections
  for (const section of template.sections) {
    if (!foundSections.has(section.title)) continue
    if (!section.validationRules?.length) continue

    const sectionContent = extractSectionContent(content, section.title)

    for (const rule of section.validationRules) {
      const warning = checkValidationRule(rule, sectionContent, section.title)
      if (warning) {
        warnings.push(warning)
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Extract content of a specific section (between its ## heading and the next ##).
 */
function extractSectionContent(content: string, sectionTitle: string): string {
  const lines = content.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${sectionTitle}`)
  if (start === -1) return ''

  const collected: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break
    collected.push(lines[i])
  }
  return collected.join('\n').trim()
}

/**
 * Check a validation rule against section content.
 * Supported rules: minLength:N
 */
function checkValidationRule(rule: string, content: string, sectionTitle: string): string | null {
  const [ruleName, ruleValue] = rule.split(':')

  switch (ruleName) {
    case 'minLength': {
      const minLen = parseInt(ruleValue, 10)
      if (content.length < minLen) {
        return `Section "${sectionTitle}" fails minLength rule: ${content.length} < ${minLen}`
      }
      return null
    }
    default:
      log.debug(`Unknown validation rule: ${ruleName}`)
      return null
  }
}
