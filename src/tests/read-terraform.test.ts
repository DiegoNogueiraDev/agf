import { describe, it, expect } from 'vitest'
import { parseTerraform } from '../core/parser/read-terraform.js'

describe('parseTerraform', () => {
  it('returns empty entries for empty content', () => {
    const result = parseTerraform('')
    expect(result.entries).toHaveLength(0)
  })

  it('parses a TWO_LABEL resource block', () => {
    const content = 'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}'
    const result = parseTerraform(content)
    const entry = result.entries.find((e) => e.kind === 'resource')
    expect(entry?.type).toBe('aws_vpc')
    expect(entry?.name).toBe('main')
  })

  it('parses a ONE_LABEL variable block', () => {
    const content = 'variable "env" {\n  default = "production"\n}'
    const result = parseTerraform(content)
    const entry = result.entries.find((e) => e.kind === 'variable')
    expect(entry?.name).toBe('env')
    expect(entry?.type).toBe('')
  })

  it('parses a NO_LABEL terraform block', () => {
    const content = 'terraform {\n  required_version = ">= 1.0"\n}'
    const result = parseTerraform(content)
    const entry = result.entries.find((e) => e.kind === 'terraform')
    expect(entry).toBeDefined()
    expect(entry?.type).toBe('')
    expect(entry?.name).toBe('')
  })

  it('parses a data source block', () => {
    const content = 'data "aws_ami" "ubuntu" {\n  filter { name = "name" }\n}'
    const result = parseTerraform(content)
    const entry = result.entries.find((e) => e.kind === 'data')
    expect(entry?.type).toBe('aws_ami')
    expect(entry?.name).toBe('ubuntu')
  })

  it('parses multiple blocks', () => {
    const content = ['resource "aws_s3_bucket" "logs" {}', 'variable "region" {}'].join('\n')
    const result = parseTerraform(content)
    expect(result.entries.length).toBeGreaterThanOrEqual(2)
  })
})
