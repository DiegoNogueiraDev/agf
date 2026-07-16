/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Scaffold — gera esqueleto de codigo a partir de nome e tipo.
 * Suporte para reuso determinístico via contrato.
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/scaffold.ts' })

/** Generates a scaffold file template string for the given name, dir, and type. */
export function scaffoldFile(
  name: string,
  dir: string,
  type: 'class' | 'function' | 'component' | 'interface' | 'type',
): string {
  log.debug(`scaffoldFile: ${name}`)
  const cleanDir = dir.replace(/\/$/, '')
  const filePath = `${cleanDir}/${name}.ts`

  const header = `/**
 * @file ${filePath}
 * @scaffolded true
 */

`

  switch (type) {
    case 'class':
      return `${header}export class ${name} {
  // @scaffolded — implementation goes here
}
`
    case 'function':
      return `${header}export function ${name}(): void {
  // @scaffolded — implementation goes here
}
`
    case 'component':
      return `${header}export interface ${name}Props {
  // TODO: define props
}

export function ${name}(_props: ${name}Props): unknown {
  // @scaffolded — implementation goes here
  return null;
}
`
    case 'interface':
      return `${header}export interface ${name} {
  // TODO: define interface ${name}
}
`
    case 'type':
      return `${header}export type ${name} = unknown;
// TODO: define type ${name}
`
    default:
      return `${header}// @scaffolded — implementation goes here
`
  }
}

/** Generates a scaffold template string that embeds the provided contract content. */
export function scaffoldFromContract(name: string, dir: string, contractContent: string): string {
  const cleanDir = dir.replace(/\/$/, '')
  const base = scaffoldFile(name, cleanDir, 'class')

  return `/**
 * @file ${cleanDir}/${name}.ts
 * @scaffolded true
 * @contract provided
 */

${contractContent}

${base}`
}
