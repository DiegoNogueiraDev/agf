/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export { BUILT_IN_SKILLS, getBuiltInSkills, getSkillsByPhase, getSkillByName } from './built-in-skills.js'
export type { BuiltInSkill } from './built-in-skills.js'
export {
  DEFAULT_HEALING_CONFIG,
  monitorGraph,
  analyzeIssues,
  planActions,
  executeActions,
  buildKnowledge,
} from './self-healing-engine.js'
export type { ExecuteOptions } from './self-healing-engine.js'
export {
  categorizeError,
  generateErrorHash,
  buildHealingMemory,
  registerSelfHealingListener,
} from './self-healing-listener.js'
export type { SelfHealingOptions } from './self-healing-listener.js'
export {
  setSkillEnabled,
  getSkillPreferences,
  createCustomSkill,
  updateCustomSkill,
  deleteCustomSkill,
  getCustomSkills,
  getCustomSkillByName,
} from './skill-store.js'
export { createTaskTemplate, listTaskTemplates, getTaskTemplateByName, deleteTaskTemplate } from './template-store.js'
