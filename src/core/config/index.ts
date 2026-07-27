/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export {
  MARKER_START,
  MARKER_END,
  generateClaudeMdSection,
  generateCopilotInstructions,
  generateCodexAgentsMdSection,
  applySection,
} from './ai-memory-generator.js'
export { loadConfig } from './config-loader.js'
export { ContextModeSchema, ConfigSchema } from './config-schema.js'
export type { ContextMode, McpGraphConfig } from './config-schema.js'
export { getIgnoreTemplate, ensureClaudeIgnore, ensureCopilotIgnore } from './ignore-templates.js'
export { resolveLayeredConfig } from './layered-config.js'
export type { ConfigField, LayeredConfigResult, ResolveOptions } from './layered-config.js'
export {
  TOOL_TABLE_FULL,
  DEPRECATED_TOOLS_SECTION,
  ANALYZE_MODES_SECTION,
  KNOWLEDGE_PIPELINE_SECTION,
  SKILLS_SECTION,
  PHASE_GATES_SECTION,
  DOD_SECTION,
  TOOL_PREREQUISITES_SECTION,
  WORKFLOWS_SECTION,
  AGENT_ANTIPATTERNS_SECTION,
  FLOW_PRINCIPLES_SECTION,
  QUALITY_METRICS_SECTION,
  DOR_SECTION,
  TDD_ENFORCEMENT_SECTION,
  PIPELINE_TOOLS_SECTION,
  TEAM_TASK_SECTION,
  DREAM_MODE_SECTION,
  AGENT_ACTIVITY_SECTION,
  ADVANCED_TOOLS_SECTION,
  OPERATIONAL_TOOLS_SECTION,
  CLI_COMMANDS,
  getToolReference,
  getAnalyzeModes,
  getSkillsByPhase,
  getCliCommands,
  getKnowledgePipeline,
  getPhaseGates,
  getDefinitionOfDone,
  getToolPrerequisites,
  getWorkflows,
  getAgentAntipatterns,
  getFlowPrinciples,
  getQualityMetrics,
  getDefinitionOfReady,
  getTddEnforcement,
  getPipelineTools,
  HARNESS_SECTION,
  getHarnessReference,
  getFullReference,
} from './reference-content.js'
