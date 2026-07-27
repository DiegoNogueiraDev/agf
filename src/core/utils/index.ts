/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export { getNodeAcTexts, getNodeAcFromStore, nodeHasAc } from './ac-helpers.js'
export {
  STORE_DIR,
  DB_FILE,
  GLOBAL_STORE_DIR,
  GLOBAL_DB_DIR,
  GLOBAL_DB_PATH,
  GLOBAL_MEMORIES_DIR,
  GLOBAL_CONFIG_FILE,
  BOOTSTRAP_TOOLS,
  ALWAYS_ALLOWED_TOOLS,
  READ_ONLY_TOOLS,
  DEFAULT_NODE_STATUS,
  DEFAULT_NODE_PRIORITY,
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_CHUNK_MAX_TOKENS,
  DEFAULT_CHUNK_OVERLAP,
  SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGE_PAIRS,
  MVP_LANGUAGE_PAIRS,
  UCR_CONFIDENCE_THRESHOLD,
  isLanguageSupported,
  isLanguagePairSupported,
} from './constants.js'
export type { SupportedLanguage } from './constants.js'
export { checkEpicPromotion, autoPromoteEpic, cascadeDownOnDone } from './epic-promotion.js'
export type { EpicPromotionResult, AutoPromoteResult, CascadeDownResult } from './epic-promotion.js'
export { verifyAndPromote } from './verified-auto-promote.js'
export type { VerifyAndPromoteResult, VerifyRejection } from './verified-auto-promote.js'
export {
  McpGraphError,
  FileNotFoundError,
  GraphNotInitializedError,
  NodeNotFoundError,
  ValidationError,
  SnapshotNotFoundError,
  getErrorMessage,
  TranslationError,
  UnsupportedLanguagePairError,
  TranslationValidationError,
  OnnxModelNotFoundError,
  ConflictError,
  LockConflictError,
  PlannerError,
  GraphIntegrityError,
  ContextBuildError,
  DeployReadinessError,
  LifecycleGateError,
  McpError,
  GraphError,
  ErrorKind,
  createEnvelope,
  isGraphError,
} from './errors.js'
export type { ConflictDetails, LockConflictDetails, ErrorEnvelope, EnvelopeInput } from './errors.js'
export { fileExists, safeReadFileSync, assertPathInsideProject } from './fs.js'
export { scoreToGrade } from './grading.js'
export type { Grade } from './grading.js'
export { generateId } from './id.js'
export { getLogBuffer, clearLogBuffer, setLogListener, logger } from './logger.js'
export { TASK_TYPES, REQUIREMENT_TYPES, DESIGN_TYPES, DESIGN_ONLY_TYPES, FEEDBACK_TYPES } from './node-type-sets.js'
export { safeParseInt } from './parse-query.js'
export type { ParseIntResult } from './parse-query.js'
export { IS_WINDOWS, whichCommand, killProcess } from './platform.js'
export { PathTraversalError, assertPathInside } from './safe-path.js'
export { tokenize, jaccardSimilarity } from './similarity.js'
export { normalizeNewlines } from './text.js'
export { now } from './time.js'
export { XP_SIZE_ORDER, XP_SIZE_POINTS } from './xp-sizing.js'
