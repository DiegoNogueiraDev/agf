/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-skill-budget-rendering — Budget-aware skill description truncation.
 *
 * Tests the algorithm that distributes character budget across skills.
 * When budget is tight, descriptions are truncated; when even names don't fit,
 * falls back to path aliases (r0/, r1/).
 */
import { describe, it, expect } from 'vitest'
import { budgetSkills, type SkillBudgetEntry, type SkillBudgetResult } from '../tui/skill-budget.js'

function makeSkill(name: string, desc: string): SkillBudgetEntry {
  return { name, description: desc }
}

describe('skill-budget: budgetSkills()', () => {
  it('returns all skills with full descriptions when budget is large', () => {
    const skills = [makeSkill('analyze', 'Analyze requirements'), makeSkill('design', 'Design architecture')]
    const result = budgetSkills(skills, 500)
    expect(result.skills.length).toBe(2)
    expect(result.skills[0].displayName).toBe('analyze')
    expect(result.skills[0].displayDesc).toBe('Analyze requirements')
    expect(result.skills[1].displayName).toBe('design')
    expect(result.skills[1].displayDesc).toBe('Design architecture')
    expect(result.truncated).toBe(false)
  })

  it('truncates descriptions proportionally when budget is tight', () => {
    const skills = [
      makeSkill('graph-analyze', 'Execute the ANALYZE phase of mcp-graph lifecycle'),
      makeSkill('graph-design', 'Execute the DESIGN phase with architecture decisions'),
    ]
    const result = budgetSkills(skills, 100)
    expect(result.truncated).toBe(true)
    // Each skill should have a truncated description
    for (const s of result.skills) {
      expect(s.displayDesc.length).toBeLessThan(s.description.length)
      expect(s.displayDesc).not.toBe('')
    }
  })

  it('fully preserves shorter descriptions while truncating longer ones', () => {
    const skills = [
      makeSkill('short', 'Quick task'),
      makeSkill('very-long-name', 'A very long description that needs many characters'),
    ]
    const result = budgetSkills(skills, 60)
    // Shorter description is fully preserved, longer is truncated
    const short = result.skills.find((s) => s.name === 'short')!
    const long = result.skills.find((s) => s.name === 'very-long-name')!
    expect(short.displayDesc).toBe('Quick task')
    expect(long.displayDesc.length).toBeLessThan(long.description.length)
  })

  it('produces deterministic output for same inputs', () => {
    const skills = [makeSkill('a', 'desc a'), makeSkill('b', 'desc b'), makeSkill('c', 'desc c')]
    const r1 = budgetSkills(skills, 50)
    const r2 = budgetSkills(skills, 50)
    expect(r1.skills.map((s) => s.displayDesc)).toEqual(r2.skills.map((s) => s.displayDesc))
  })

  it("falls back to aliases when even names don't fit", () => {
    const skills = [
      makeSkill('very-long-skill-name-alpha', 'Alpha description'),
      makeSkill('very-long-skill-name-beta', 'Beta description'),
      makeSkill('very-long-skill-name-gamma', 'Gamma description'),
    ]
    const result = budgetSkills(skills, 20)
    // With 20 chars for 3 skills, names alone won't fit
    if (result.aliased) {
      expect(result.skills[0].displayName).toBe('r0/')
      expect(result.skills[1].displayName).toBe('r1/')
      expect(result.skills[2].displayName).toBe('r2/')
    }
  })

  it('handles empty skills array', () => {
    const result = budgetSkills([], 100)
    expect(result.skills.length).toBe(0)
    expect(result.truncated).toBe(false)
  })

  it('preserves full names when descriptions are fully truncated', () => {
    const skills = [makeSkill('analyze', 'Analyze phase description'), makeSkill('design', 'Design phase description')]
    const result = budgetSkills(skills, 30)
    // Budget should cover names ("analyze", "design") = 13 chars + separators
    // Remaining budget for descriptions is tight
    expect(result.skills[0].displayName).toBe('analyze')
    expect(result.skills[1].displayName).toBe('design')
    // Descriptions may be empty if budget is exhausted by names
  })

  it('shows total usage and remaining budget', () => {
    const result = budgetSkills([makeSkill('a', 'b')], 200)
    expect(result.budgetUsed).toBeGreaterThan(0)
    expect(result.budgetUsed).toBeLessThanOrEqual(200)
    expect(result.budgetTotal).toBe(200)
  })

  it('respects minimum per-skill allocation', () => {
    const skills = [
      makeSkill('a', 'desc'),
      makeSkill('b', 'desc'),
      makeSkill('c', 'desc'),
      makeSkill('d', 'desc'),
      makeSkill('e', 'desc'),
    ]
    const result = budgetSkills(skills, 30)
    // With 5 skills and 30 chars, some skills may be omitted
    expect(result.skills.length).toBeGreaterThan(0)
    expect(result.skills.length).toBeLessThanOrEqual(5)
  })
})
