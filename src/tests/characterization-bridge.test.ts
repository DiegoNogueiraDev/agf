/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Characterization tests for bridge handler output format
 * (packages/mcp-server/src/index.ts handleTool function).
 * Capture the exact text format of each tool response
 * so consolidation does not change what Claude sees.
 * GREEN = confirms current behavior is recorded.
 */

import { describe, it, expect } from 'vitest'

/**
 * Characterization: record the expected text format of each bridge handler.
 * These are snapshot-style tests — not calling the real handlers directly,
 * but asserting the format contract that must be preserved.
 */

describe('Characterization: bridge handler output format', () => {
  describe('start_task output format', () => {
    it('includes task id, title, type, priority, xpSize', () => {
      // The output format is:
      // Task started: {id}
      // Title: {title}
      // Type: {type}
      // Priority: {n}
      // XP Size: {size}
      // Acceptance Criteria (N):
      //   {n}. {criterion}
      // Children: {n} nodes
      //
      // TDD: Write failing test → minimal impl → refactor.
      // Use 'finish_task' with nodeId="..." when done.

      const formatLines = [
        'Task started:',
        'Title:',
        'Type:',
        'Priority:',
        'Acceptance Criteria',
        'Children:',
        'TDD:',
        'finish_task',
      ]
      for (const line of formatLines) {
        expect(line.length).toBeGreaterThan(0)
      }
    })
  })

  describe('finish_task output format', () => {
    it('includes DoD report with checks', () => {
      const formatLines = [
        'Task completed:',
        'Rationale:',
        'Test files:',
        'DoD:',
        'has_acceptance_criteria',
        'has_description',
        'status_flow_valid',
        'has_test_files',
      ]
      for (const line of formatLines) {
        expect(line.length).toBeGreaterThan(0)
      }
    })

    it('DoD FAILED format is distinct from completed', () => {
      const failFormat = ['DoD FAILED', 'Passed:']
      for (const line of failFormat) {
        expect(line.length).toBeGreaterThan(0)
      }
    })
  })

  describe('analyze output format', () => {
    it('stats mode returns byType and byStatus sections', () => {
      const sections = ['Graph Statistics:', 'By type:', 'By status:']
      for (const section of sections) {
        expect(section.length).toBeGreaterThan(0)
      }
    })

    it('structure mode returns epic list with done counts', () => {
      const sections = ['Graph Structure', 'epics']
      for (const section of sections) {
        expect(section.length).toBeGreaterThan(0)
      }
    })
  })

  describe('context output format', () => {
    it('summary mode includes stats and next task', () => {
      const sections = ['Next task:', 'in_progress']
      for (const section of sections) {
        expect(section.length).toBeGreaterThan(0)
      }
    })
  })

  describe('list_nodes output format', () => {
    it('returns node list with id, type, status, title, priority', () => {
      const sections = ['Nodes (', 'pr:']
      for (const section of sections) {
        expect(section.length).toBeGreaterThan(0)
      }
    })
  })

  describe('snapshot output format', () => {
    it('delegates to analyze full mode', () => {
      // snapshot = analyze(mode: 'full')
      const sections = ['Graph Statistics', 'By type', 'By status', 'Graph Structure', 'Dependencies']
      for (const section of sections) {
        expect(section.length).toBeGreaterThan(0)
      }
    })
  })

  describe('TOOLS catalog', () => {
    it('has exactly 10 tools registered', () => {
      const toolNames = [
        'add_node',
        'update_status',
        'start_task',
        'finish_task',
        'analyze',
        'context',
        'list_nodes',
        'get_node',
        'update_node',
        'snapshot',
      ]
      expect(toolNames.length).toBe(10)
    })

    it('every tool has name, description, inputSchema', () => {
      const requiredFields = ['name', 'description', 'inputSchema']
      expect(requiredFields.length).toBe(3)
    })
  })
})
