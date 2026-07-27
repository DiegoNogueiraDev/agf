/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Swagger/WSDL Parser — parses OpenAPI 2.0/3.0 (YAML/JSON) and WSDL (XML)
 * into a normalized structure for knowledge store indexing.
 *
 * Zero new dependencies: uses `yaml` (already in project) for YAML parsing
 * and `fast-xml-parser` (already in project) for WSDL parsing.
 */

import { XMLParser } from 'fast-xml-parser'
import YAML from 'yaml'
import { createLogger } from '../utils/logger.js'
import { ValidationError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'read-swagger.ts' })

// ---- Public Types ----

export interface SwaggerEndpointParam {
  name: string
  location: string // "query" | "path" | "header" | "body"
  type: string
  required: boolean
}

export interface SwaggerEndpoint {
  method: string
  path: string
  operationId: string
  summary: string
  parameters: SwaggerEndpointParam[]
  requestBody: string | undefined
  responses: string[]
}

export interface SwaggerSchemaProperty {
  name: string
  type: string
  required: boolean
}

export interface SwaggerSchema {
  name: string
  type: string
  properties: SwaggerSchemaProperty[]
  required: string[]
}

export interface SwaggerParseResult {
  title: string
  version: string
  endpoints: SwaggerEndpoint[]
  schemas: SwaggerSchema[]
  format: 'openapi2' | 'openapi3' | 'wsdl'
}

// ---- HTTP method list for path extraction ----

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head'])

// ---- OpenAPI Parsing ----

/**
 * Parse OpenAPI 2.0/3.0 content (YAML or JSON) into SwaggerParseResult.
 */
export function parseSwaggerContent(content: string): SwaggerParseResult {
  if (!content || content.trim().length === 0) {
    throw new ValidationError('Swagger/OpenAPI content is empty', [{ field: 'content', message: 'empty' }])
  }

  const doc = parseYamlOrJson(content)

  if (doc.openapi && typeof doc.openapi === 'string' && doc.openapi.startsWith('3')) {
    return parseOpenApi3(doc)
  }

  if (doc.swagger && typeof doc.swagger === 'string' && doc.swagger.startsWith('2')) {
    return parseOpenApi2(doc)
  }

  throw new ValidationError('Unrecognized API spec format. Expected OpenAPI 2.0 or 3.0', [
    { field: 'format', message: "neither 'openapi' nor 'swagger' field found" },
  ])
}

function parseOpenApi3(doc: Record<string, unknown>): SwaggerParseResult {
  const info = (doc.info ?? {}) as Record<string, unknown>
  const title = String(info.title ?? 'Untitled API')
  const version = String(info.version ?? '0.0.0')

  log.info('Parsing OpenAPI 3.0', { title, version })

  const endpoints = extractPathEndpoints(doc.paths as Record<string, unknown> | undefined)
  const schemas = extractComponentSchemas(
    (doc.components as Record<string, unknown> | undefined)?.schemas as Record<string, unknown> | undefined,
  )

  log.debug('OpenAPI 3.0 parsed', {
    endpoints: String(endpoints.length),
    schemas: String(schemas.length),
  })

  return { title, version, endpoints, schemas, format: 'openapi3' }
}

function parseOpenApi2(doc: Record<string, unknown>): SwaggerParseResult {
  const info = (doc.info ?? {}) as Record<string, unknown>
  const title = String(info.title ?? 'Untitled API')
  const version = String(info.version ?? '0.0.0')

  log.info('Parsing OpenAPI 2.0 (Swagger)', { title, version })

  const endpoints = extractPathEndpoints(doc.paths as Record<string, unknown> | undefined)
  const schemas = extractComponentSchemas(doc.definitions as Record<string, unknown> | undefined)

  log.debug('OpenAPI 2.0 parsed', {
    endpoints: String(endpoints.length),
    schemas: String(schemas.length),
  })

  return { title, version, endpoints, schemas, format: 'openapi2' }
}

function extractPathEndpoints(paths: Record<string, unknown> | undefined): SwaggerEndpoint[] {
  if (!paths) return []
  const endpoints: SwaggerEndpoint[] = []

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue
    const methodsObj = methods as Record<string, unknown>

    for (const [method, operation] of Object.entries(methodsObj)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue
      if (!operation || typeof operation !== 'object') continue
      const op = operation as Record<string, unknown>

      const parameters: SwaggerEndpointParam[] = []
      const rawParams = op.parameters as Array<Record<string, unknown>> | undefined
      if (Array.isArray(rawParams)) {
        for (const pVar of rawParams) {
          parameters.push({
            name: String(pVar.name ?? ''),
            location: String(pVar.in ?? 'query'),
            type: extractParamType(pVar),
            required: Boolean(pVar.required),
          })
        }
      }

      const responses: string[] = []
      const rawResponses = op.responses as Record<string, unknown> | undefined
      if (rawResponses) {
        for (const [code, resp] of Object.entries(rawResponses)) {
          const desc =
            typeof resp === 'object' && resp ? String((resp as Record<string, unknown>).description ?? '') : ''
          responses.push(`${code}: ${desc}`)
        }
      }

      let requestBody: string | undefined
      if (op.requestBody && typeof op.requestBody === 'object') {
        const rb = op.requestBody as Record<string, unknown>
        const content = rb.content as Record<string, unknown> | undefined
        if (content) {
          const firstMime = Object.values(content)[0] as Record<string, unknown> | undefined
          if (firstMime?.schema) {
            requestBody = extractRefName(firstMime.schema as Record<string, unknown>)
          }
        }
      }

      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId: String(op.operationId ?? `${method}_${path}`),
        summary: String(op.summary ?? ''),
        parameters,
        requestBody,
        responses,
      })
    }
  }

  return endpoints
}

function extractComponentSchemas(schemas: Record<string, unknown> | undefined): SwaggerSchema[] {
  if (!schemas) return []
  const resultValue: SwaggerSchema[] = []

  for (const [name, schema] of Object.entries(schemas)) {
    if (!schema || typeof schema !== 'object') continue
    const sVar = schema as Record<string, unknown>

    const requiredFields = Array.isArray(sVar.required) ? (sVar.required as string[]) : []

    const properties: SwaggerSchemaProperty[] = []
    const rawProps = sVar.properties as Record<string, unknown> | undefined
    if (rawProps) {
      for (const [propName, propDef] of Object.entries(rawProps)) {
        const def = propDef as Record<string, unknown> | undefined
        properties.push({
          name: propName,
          type: def ? String(def.type ?? 'object') : 'unknown',
          required: requiredFields.includes(propName),
        })
      }
    }

    resultValue.push({
      name,
      type: String(sVar.type ?? 'object'),
      properties,
      required: requiredFields,
    })
  }

  return resultValue
}

function extractParamType(param: Record<string, unknown>): string {
  if (param.schema && typeof param.schema === 'object') {
    return String((param.schema as Record<string, unknown>).type ?? 'string')
  }
  return String(param.type ?? 'string')
}

function extractRefName(schema: Record<string, unknown>): string {
  const ref = schema.$ref as string | undefined
  if (ref) {
    const parts = ref.split('/')
    return parts[parts.length - 1]
  }
  return String(schema.type ?? 'object')
}

function parseYamlOrJson(content: string): Record<string, unknown> {
  const trimmed = content.trim()

  // Try JSON first (faster check)
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'fall through to YAML' })
    }
  }

  // Try YAML
  try {
    const parsed = YAML.parse(trimmed)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: 'YAML parse failed — fall through' })
  }

  throw new ValidationError('Failed to parse content as YAML or JSON', [
    { field: 'content', message: 'not valid YAML or JSON' },
  ])
}

// ---- WSDL Parsing ----

/**
 * Parse WSDL XML content into SwaggerParseResult.
 */
export function parseWsdlContent(content: string): SwaggerParseResult {
  if (!content || content.trim().length === 0) {
    throw new ValidationError('WSDL content is empty', [{ field: 'content', message: 'empty' }])
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    processEntities: {
      maxEntityCount: 100_000,
      maxTotalExpansions: 100_000,
      maxExpandedLength: 10_000_000,
      maxEntitySize: 100_000,
    },
    isArray: () => true,
  })

  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(content) as Record<string, unknown>
  } catch (err) {
    throw new ValidationError('Invalid WSDL XML', [
      { field: 'xml', message: err instanceof Error ? err.message : String(err) },
    ])
  }

  // Navigate to definitions root
  const definitions = getFirst(parsed, 'definitions')
  if (!definitions) {
    throw new ValidationError('WSDL missing <definitions> root element', [
      { field: 'structure', message: 'no <definitions> found' },
    ])
  }

  const serviceName = getAttr(definitions, 'name') ?? 'Unknown Service'
  log.info('Parsing WSDL', { serviceName })

  // Extract operations from portType
  const endpoints: SwaggerEndpoint[] = []
  const portTypes = getArraySafe(definitions, 'portType')
  for (const pt of portTypes) {
    const operations = getArraySafe(pt, 'operation')
    for (const op of operations) {
      const opName = getAttr(op, 'name') ?? 'unknown'
      endpoints.push({
        method: 'SOAP',
        path: opName,
        operationId: opName,
        summary: `SOAP operation: ${opName}`,
        parameters: [],
        requestBody: undefined,
        responses: [],
      })
    }
  }

  // Extract schemas from types
  const schemas: SwaggerSchema[] = []
  const typesArr = getArraySafe(definitions, 'types')
  for (const types of typesArr) {
    const schemaElems = getArraySafe(types, 'xsd:schema')
    // Also try without prefix
    const schemaElemsAlt = getArraySafe(types, 'schema')
    for (const schemaElem of [...schemaElems, ...schemaElemsAlt]) {
      const elements = [...getArraySafe(schemaElem, 'xsd:element'), ...getArraySafe(schemaElem, 'element')]

      for (const elem of elements) {
        const elemName = getAttr(elem, 'name')
        if (!elemName) continue

        const properties: SwaggerSchemaProperty[] = []
        // Look for complexType → sequence → element
        const complexTypes = [...getArraySafe(elem, 'xsd:complexType'), ...getArraySafe(elem, 'complexType')]
        for (const ct of complexTypes) {
          const sequences = [...getArraySafe(ct, 'xsd:sequence'), ...getArraySafe(ct, 'sequence')]
          for (const seq of sequences) {
            const seqElems = [...getArraySafe(seq, 'xsd:element'), ...getArraySafe(seq, 'element')]
            for (const se of seqElems) {
              const propName = getAttr(se, 'name')
              const propType = getAttr(se, 'type') ?? 'string'
              if (propName) {
                properties.push({
                  name: propName,
                  type: propType.replace(/^xsd:/, ''),
                  required: false,
                })
              }
            }
          }
        }

        schemas.push({
          name: elemName,
          type: 'object',
          properties,
          required: [],
        })
      }
    }
  }

  log.debug('WSDL parsed', {
    serviceName,
    operations: String(endpoints.length),
    schemas: String(schemas.length),
  })

  return {
    title: serviceName,
    version: '1.0',
    endpoints,
    schemas,
    format: 'wsdl',
  }
}

// ---- XML Helpers ----

function getFirst(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const valValue = obj[key]
  if (Array.isArray(valValue) && valValue.length > 0) return valValue[0] as Record<string, unknown>
  if (valValue && typeof valValue === 'object') return valValue as Record<string, unknown>
  return undefined
}

function getArraySafe(obj: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const valValue = obj[key]
  if (Array.isArray(valValue)) return valValue as Array<Record<string, unknown>>
  if (valValue && typeof valValue === 'object') return [valValue as Record<string, unknown>]
  return []
}

function getAttr(obj: Record<string, unknown>, name: string): string | undefined {
  const valValue = obj[`@_${name}`]
  return valValue != null ? String(valValue) : undefined
}
