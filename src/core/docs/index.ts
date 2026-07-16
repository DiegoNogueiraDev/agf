/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export {
  generateReadmeStats,
  generateArchToolSection,
  generateArchRouteSection,
  generateToolRefSummary,
} from './doc-generator.js'
export { applySectionWithName } from './doc-updater.js'
export { DocsCacheStore } from './docs-cache-store.js'
export type { CachedDoc } from './docs-cache-store.js'
export { DocsSyncer } from './docs-syncer.js'
export type { Context7Fetcher } from './docs-syncer.js'
export type { DocsManifest } from './generate-docs-manifest.js'
export { createMcpContext7Fetcher } from './mcp-context7-fetcher.js'
export type { Context7FetcherOptions } from './mcp-context7-fetcher.js'
export { introspectRoutes } from './route-introspector.js'
export type { EndpointInfo, RouteInfo } from './route-introspector.js'
export { detectStack } from './stack-detector.js'
export type { DetectedStack } from './stack-detector.js'
export { introspectTools } from './tool-introspector.js'
export type { ToolInfo } from './tool-introspector.js'
