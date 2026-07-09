/*!
 * parse-api-cmd — agf parse-api CLI command.
 *
 * WHY: Exposes parseSwaggerContent/parseWsdlContent (read-swagger.ts) —
 * structured OpenAPI 2.0/3.0/WSDL parsing into endpoints + schemas, for
 * knowledge-store indexing. agf import-prd currently reads .wsdl/.yaml/.json
 * as RAW TEXT (file-reader.ts's switch falls through to buffer.toString for
 * those extensions) — this command is the structured alternative.
 *
 * Composes with: read-swagger.ts (core, pure — no I/O beyond the read below).
 */

import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createCliOutput } from '../shared/cli-output.js'
import { parseSwaggerContent, parseWsdlContent } from '../../core/parser/read-swagger.js'
import { createLogger } from '../../core/utils/logger.js'
import { getErrorMessage } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'cli', source: 'parse-api-cmd.ts' })

/** Builds the `agf parse-api` CLI command (Commander definition). */
export function parseApiCommand(): Command {
  log.info('parse-api command registered')
  return new Command('parse-api')
    .description('Parseia uma spec OpenAPI 2.0/3.0 (YAML/JSON) ou WSDL em endpoints + schemas estruturados')
    .argument('<file>', 'Caminho do arquivo (.yaml/.yml/.json para OpenAPI, .wsdl para SOAP)')
    .action(async (file: string) => {
      const out = createCliOutput('parse-api')
      try {
        const content = await readFile(path.resolve(file), 'utf-8')
        const ext = path.extname(file).toLowerCase()
        const result = ext === '.wsdl' ? parseWsdlContent(content) : parseSwaggerContent(content)
        out.ok(result)
      } catch (e) {
        out.err('PARSE_FAILED', getErrorMessage(e))
      }
    })
}
