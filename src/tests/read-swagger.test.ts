import { describe, it, expect } from 'vitest'
import { parseSwaggerContent, parseWsdlContent } from '../core/parser/read-swagger.js'

const SWAGGER2 = JSON.stringify({
  swagger: '2.0',
  info: { title: 'Pet Store', version: '1.0' },
  paths: {
    '/pets': {
      get: { operationId: 'listPets', summary: 'List pets', responses: {} },
      post: { operationId: 'createPet', summary: 'Create pet', responses: {} },
    },
  },
  definitions: {
    Pet: { type: 'object', properties: { id: { type: 'integer' } } },
  },
})

const OPENAPI3 = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'My API', version: '2.0' },
  paths: {
    '/users': {
      get: { operationId: 'getUsers', summary: 'Get users', responses: {} },
    },
  },
  components: {
    schemas: {
      User: { type: 'object', properties: { id: { type: 'string' } } },
    },
  },
})

describe('parseSwaggerContent', () => {
  it('throws for empty content', () => {
    expect(() => parseSwaggerContent('')).toThrow()
  })

  it('parses Swagger 2.0 JSON', () => {
    const result = parseSwaggerContent(SWAGGER2)
    expect(result.title).toBe('Pet Store')
    expect(result.version).toBe('1.0')
  })

  it('parses OpenAPI 3.0 JSON', () => {
    const result = parseSwaggerContent(OPENAPI3)
    expect(result.title).toBe('My API')
  })

  it('extracts endpoints from paths', () => {
    const result = parseSwaggerContent(SWAGGER2)
    expect(Array.isArray(result.endpoints)).toBe(true)
    expect(result.endpoints.length).toBeGreaterThan(0)
  })

  it('extracts schemas from definitions', () => {
    const result = parseSwaggerContent(SWAGGER2)
    expect(Array.isArray(result.schemas)).toBe(true)
    expect(result.schemas.length).toBeGreaterThan(0)
  })

  it('returns a format string', () => {
    const result = parseSwaggerContent(SWAGGER2)
    expect(typeof result.format).toBe('string')
    expect(result.format.length).toBeGreaterThan(0)
  })

  it('throws for unknown format', () => {
    const unknown = JSON.stringify({ foo: 'bar' })
    expect(() => parseSwaggerContent(unknown)).toThrow()
  })
})

describe('parseWsdlContent', () => {
  const WSDL = `<?xml version="1.0"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  name="Calculator"
  targetNamespace="http://example.com/calculator">
  <portType name="CalculatorPortType">
    <operation name="Add">
      <input message="tns:AddRequest"/>
      <output message="tns:AddResponse"/>
    </operation>
  </portType>
</definitions>`

  it('parses WSDL without throwing', () => {
    expect(() => parseWsdlContent(WSDL)).not.toThrow()
  })

  it('returns a SwaggerParseResult', () => {
    const result = parseWsdlContent(WSDL)
    expect(result).toBeDefined()
    expect(typeof result.format).toBe('string')
  })

  it('throws for empty WSDL content', () => {
    expect(() => parseWsdlContent('')).toThrow()
  })
})
