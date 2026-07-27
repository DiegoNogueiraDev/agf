/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * The bodies behind the nine `templates/*.md` references, keyed by the reference itself.
 *
 * WHY modules and not files: `package.json` ships `dist/`, and `existsSync('templates/x.md')`
 * resolves against the *caller's* working directory. An `agf` installed globally would have looked
 * for the skeleton inside whatever project the user happened to be standing in — which is exactly
 * why nine of thirteen scaffolds recovered nothing for as long as they existed. A skeleton that
 * ships with the tool must be part of the tool.
 *
 * A project may still put a real file at that path, and `resolveScaffoldBody` prefers it. That is
 * an override for a team with house style, not the default for everyone else.
 */

import { CLI_TS, FASTAPI_PROJECT, REACT_COMPONENT } from './web.js'
import { DART_FLUTTER_WIDGET, KOTLIN_KTOR_ROUTE, SPRING_REST_ENDPOINT } from './jvm-dart.js'
import { PRD_SOFTWARE, REPO_STRUCTURE, SKILL_LIFECYCLE } from './documents.js'

/** `structureRef` → the skeleton it names. Every ref in the corpus appears here (test-enforced). */
export const BUILTIN_TEMPLATES: Readonly<Record<string, string>> = {
  'templates/react-component.md': REACT_COMPONENT,
  'templates/cli-ts.md': CLI_TS,
  'templates/fastapi-project.md': FASTAPI_PROJECT,
  'templates/spring-rest-endpoint.md': SPRING_REST_ENDPOINT,
  'templates/kotlin-ktor-route.md': KOTLIN_KTOR_ROUTE,
  'templates/dart-flutter-widget.md': DART_FLUTTER_WIDGET,
  'templates/prd_v2.md': PRD_SOFTWARE,
  'templates/skill.md': SKILL_LIFECYCLE,
  'templates/repo-structure.md': REPO_STRUCTURE,
}
