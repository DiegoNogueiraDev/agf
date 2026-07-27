/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Route Introspector — static analysis of Express API routes.
 * Parses router.ts for mount paths and route files for endpoint definitions.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export interface EndpointInfo {
  method: string
  path: string
}

export interface RouteInfo {
  routerName: string
  mountPath: string
  endpoints: EndpointInfo[]
  sourceFile: string
}

// Regex to match router.use("/path", createXxxRouter(...))
const MOUNT_REGEX = /router\.use\("([^"]+)",\s*create(\w+)Router/g

// Regex to match router.get/post/patch/put/delete("/path"
const ENDPOINT_REGEX = /router\.(get|post|patch|put|delete)\("([^"]+)"/g

/**
 * Map from router factory name (PascalCase without "Router") to source file.
 * e.g., "Nodes" → "nodes.ts", "TranslationProject" → "translation-project.ts"
 */
function factoryNameToFile(factoryName: string): string {
  // Convert PascalCase to kebab-case
  const kebab = factoryName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  return `${kebab}.ts`
}

/**
 * Introspect all API routes by parsing router.ts and route files.
 */
export function introspectRoutes(apiDir: string): RouteInfo[] {
  const routerPath = path.join(apiDir, 'router.ts')
  if (!existsSync(routerPath)) return []

  const routerContent = readFileSync(routerPath, 'utf-8')
  const routesDir = path.join(apiDir, 'routes')
  const routes: RouteInfo[] = []

  MOUNT_REGEX.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = MOUNT_REGEX.exec(routerContent)) !== null) {
    const mountPath = match[1]
    const factoryName = match[2]
    const sourceFile = factoryNameToFile(factoryName)
    const routeFilePath = path.join(routesDir, sourceFile)

    const endpoints: EndpointInfo[] = []

    if (existsSync(routeFilePath)) {
      const routeContent = readFileSync(routeFilePath, 'utf-8')
      ENDPOINT_REGEX.lastIndex = 0
      let endpointMatch: RegExpExecArray | null

      while ((endpointMatch = ENDPOINT_REGEX.exec(routeContent)) !== null) {
        endpoints.push({
          method: endpointMatch[1],
          path: endpointMatch[2],
        })
      }
    }

    routes.push({
      routerName: factoryName.charAt(0).toLowerCase() + factoryName.slice(1),
      mountPath,
      endpoints,
      sourceFile,
    })
  }

  return routes
}
