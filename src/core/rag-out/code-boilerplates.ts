/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-OUT canonical code boilerplate descriptors — "boilerplates de código canônicos"
 * (PRD 2.2 source 2). These are language-annotated project-structure scaffolds that
 * the agent generates repeatedly with small variations: CLI TypeScript, FastAPI, and
 * React component. The language annotation activates the gate's language guard — a
 * TypeScript boilerplate is never recovered into a Python project.
 */

import type { ScaffoldDescriptor } from './gate.js'

export const CODE_BOILERPLATE_DESCRIPTORS: readonly ScaffoldDescriptor[] = [
  {
    id: 'cli-ts',
    goal: 'estrutura de projeto CLI em TypeScript com Commander, tsup e Vitest',
    fitTags: ['cli', 'typescript', 'commander', 'node', 'tsup', 'vitest', 'project', 'projeto', 'structure'],
    slots: ['projectName', 'commands[]', 'description', 'version'],
    noveltyFloor: 0.55,
    structureRef: 'templates/cli-ts.md',
    language: 'typescript',
  },
  {
    id: 'fastapi-project',
    goal: 'projeto FastAPI com rotas, modelos Pydantic e SQLAlchemy',
    fitTags: ['fastapi', 'python', 'api', 'rest', 'pydantic', 'sqlalchemy', 'project', 'projeto', 'routes'],
    slots: ['projectName', 'routes[]', 'models[]', 'description'],
    noveltyFloor: 0.55,
    structureRef: 'templates/fastapi-project.md',
    language: 'python',
  },
  {
    id: 'react-component',
    goal: 'componente React com interface de props, hooks e testes TypeScript',
    fitTags: ['react', 'component', 'typescript', 'hooks', 'props', 'tsx', 'ui', 'componente'],
    slots: ['componentName', 'props[]', 'hooks[]', 'description'],
    noveltyFloor: 0.58,
    structureRef: 'templates/react-component.md',
    language: 'typescript',
  },
  {
    id: 'spring-rest-endpoint',
    goal: 'REST endpoint handler in Spring Boot Java with controller, service, and repository layers',
    fitTags: [
      'java',
      'spring',
      'springboot',
      'rest',
      'endpoint',
      'handler',
      'controller',
      'service',
      'repository',
      'api',
    ],
    slots: ['resourceName', 'methods[]', 'dto', 'description'],
    noveltyFloor: 0.55,
    structureRef: 'templates/spring-rest-endpoint.md',
    language: 'java',
  },
  {
    id: 'kotlin-ktor-route',
    goal: 'Ktor HTTP route handler in Kotlin with serialization and coroutine support',
    fitTags: ['kotlin', 'ktor', 'route', 'handler', 'coroutine', 'serialization', 'rest', 'api'],
    slots: ['routePath', 'methods[]', 'responseModel', 'description'],
    noveltyFloor: 0.55,
    structureRef: 'templates/kotlin-ktor-route.md',
    language: 'kotlin',
  },
  {
    id: 'dart-flutter-widget',
    goal: 'Flutter StatefulWidget in Dart with state management and build method',
    fitTags: ['dart', 'flutter', 'widget', 'stateful', 'build', 'state', 'ui', 'mobile'],
    slots: ['widgetName', 'stateFields[]', 'description'],
    noveltyFloor: 0.55,
    structureRef: 'templates/dart-flutter-widget.md',
    language: 'dart',
  },
]

export function loadCodeBoilerplateCorpus(): readonly ScaffoldDescriptor[] {
  return CODE_BOILERPLATE_DESCRIPTORS
}
