/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Deterministic language reference rules for multi-language code indexing.
 * Single source of truth for visibility, docstrings, test patterns,
 * imports, and ignored directories per language.
 *
 * All rules are based on official language documentation:
 * Python (PEP 257), Go (GoDoc), Rust (Rustdoc), Java (Javadoc),
 * C/C++ (Doxygen), Ruby (YARD), PHP (PHPDoc), Kotlin (KDoc),
 * Swift (DocC), C# (XML Doc), Lua (LDoc).
 */

// ── Types ────────────────────────────────────────────────

export type ExportDetection =
  | 'underscore_prefix' // Python: _name = private
  | 'uppercase_first' // Go: Uppercase = exported
  | 'pub_keyword' // Rust: pub keyword
  | 'modifier_keyword' // Java, PHP, Kotlin, Swift, C#: public/private/etc.
  | 'static_keyword' // C: static = internal linkage
  | 'access_specifier' // C++: public:/private: sections
  | 'return_table' // Lua: returned module table = exports
  | 'visibility_section' // Ruby: private/protected sections

export type DefaultVisibility = 'public' | 'private' | 'internal' | 'package'

export interface VisibilityRules {
  defaultVisibility: DefaultVisibility
  exportDetection: ExportDetection
  modifiers: string[]
}

export interface DocstringPattern {
  commentRegex: RegExp
  style: 'triple_quote' | 'block_comment' | 'line_comment' | 'triple_dash'
}

export interface LanguageReference {
  languageId: string
  extensions: string[]
  testPatterns: RegExp[]
  ignoredDirs: string[]
  docstringPattern: DocstringPattern
  visibilityRules: VisibilityRules
  importNodeTypes: string[]
  symbolNodeTypes: Record<string, string>
}

// ── Language References ──────────────────────────────────

export const LANGUAGE_REFERENCES: Record<string, LanguageReference> = {
  python: {
    languageId: 'python',
    extensions: ['.py', '.pyi'],
    testPatterns: [/test_.*\.py$/, /.*_test\.py$/, /conftest\.py$/],
    ignoredDirs: ['.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', '.tox', '.ruff_cache'],
    docstringPattern: {
      commentRegex: /^["']{3}/,
      style: 'triple_quote',
    },
    visibilityRules: {
      defaultVisibility: 'public',
      exportDetection: 'underscore_prefix',
      modifiers: [],
    },
    importNodeTypes: ['import_statement', 'import_from_statement'],
    symbolNodeTypes: {
      function: 'function_definition',
      class: 'class_definition',
      method: 'function_definition',
      variable: 'assignment',
      module: 'module',
    },
  },

  go: {
    languageId: 'go',
    extensions: ['.go'],
    testPatterns: [/_test\.go$/],
    ignoredDirs: ['vendor'],
    docstringPattern: {
      commentRegex: /^\/\//,
      style: 'line_comment',
    },
    visibilityRules: {
      defaultVisibility: 'package',
      exportDetection: 'uppercase_first',
      modifiers: [],
    },
    importNodeTypes: ['import_declaration'],
    symbolNodeTypes: {
      function: 'function_declaration',
      method: 'method_declaration',
      struct: 'struct_type',
      interface: 'interface_type',
      package: 'package_clause',
      constant: 'const_declaration',
      variable: 'var_declaration',
    },
  },

  rust: {
    languageId: 'rust',
    extensions: ['.rs'],
    testPatterns: [/_test\.rs$/, /tests\//],
    ignoredDirs: ['target'],
    docstringPattern: {
      commentRegex: /^\/\/[/!]/,
      style: 'line_comment',
    },
    visibilityRules: {
      defaultVisibility: 'private',
      exportDetection: 'pub_keyword',
      modifiers: ['pub', 'pub(crate)', 'pub(super)'],
    },
    importNodeTypes: ['use_declaration'],
    symbolNodeTypes: {
      function: 'function_item',
      struct: 'struct_item',
      enum: 'enum_item',
      trait: 'trait_item',
      module: 'mod_item',
      constant: 'const_item',
      macro: 'macro_definition',
      type_alias: 'type_item',
    },
  },

  java: {
    languageId: 'java',
    extensions: ['.java'],
    testPatterns: [/Test\.java$/, /Tests\.java$/, /TestCase\.java$/, /IT\.java$/, /src\/test\//],
    ignoredDirs: ['target', 'build', '.gradle', '.idea', 'out'],
    docstringPattern: {
      commentRegex: /^\/\*\*/,
      style: 'block_comment',
    },
    visibilityRules: {
      defaultVisibility: 'package',
      exportDetection: 'modifier_keyword',
      modifiers: ['public', 'protected', 'private'],
    },
    importNodeTypes: ['import_declaration'],
    symbolNodeTypes: {
      class: 'class_declaration',
      interface: 'interface_declaration',
      enum: 'enum_declaration',
      method: 'method_declaration',
      annotation: 'annotation_type_declaration',
      package: 'package_declaration',
      variable: 'field_declaration',
    },
  },

  c: {
    languageId: 'c',
    extensions: ['.c', '.h'],
    testPatterns: [/_test\.c$/, /test_.*\.c$/, /tests\//],
    ignoredDirs: ['build', 'cmake-build-debug', 'cmake-build-release', '.ccache'],
    docstringPattern: {
      commentRegex: /^\/\*\*|^\/\/\//,
      style: 'block_comment',
    },
    visibilityRules: {
      defaultVisibility: 'public',
      exportDetection: 'static_keyword',
      modifiers: ['static', 'extern'],
    },
    importNodeTypes: ['preproc_include'],
    symbolNodeTypes: {
      function: 'function_definition',
      struct: 'struct_specifier',
      enum: 'enum_specifier',
      variable: 'declaration',
      macro: 'preproc_def',
      type_alias: 'type_definition',
    },
  },

  cpp: {
    languageId: 'cpp',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
    testPatterns: [/_test\.cpp$/, /_test\.cc$/, /test_.*\.cpp$/, /tests\//],
    ignoredDirs: ['build', 'cmake-build-debug', 'cmake-build-release', '.ccache'],
    docstringPattern: {
      commentRegex: /^\/\*\*|^\/\/\//,
      style: 'block_comment',
    },
    visibilityRules: {
      defaultVisibility: 'public',
      exportDetection: 'access_specifier',
      modifiers: ['public', 'private', 'protected'],
    },
    importNodeTypes: ['preproc_include', 'using_declaration'],
    symbolNodeTypes: {
      function: 'function_definition',
      class: 'class_specifier',
      struct: 'struct_specifier',
      enum: 'enum_specifier',
      module: 'namespace_definition',
      variable: 'declaration',
      macro: 'preproc_def',
    },
  },

  ruby: {
    languageId: 'ruby',
    extensions: ['.rb'],
    testPatterns: [/_spec\.rb$/, /_test\.rb$/, /spec\//],
    ignoredDirs: ['vendor/bundle', '.bundle'],
    docstringPattern: {
      commentRegex: /^#/,
      style: 'line_comment',
    },
    visibilityRules: {
      defaultVisibility: 'public',
      exportDetection: 'visibility_section',
      modifiers: ['public', 'private', 'protected'],
    },
    importNodeTypes: ['call'],
    symbolNodeTypes: {
      method: 'method',
      class: 'class',
      module: 'module',
    },
  },

  php: {
    languageId: 'php',
    extensions: ['.php'],
    testPatterns: [/Test\.php$/, /tests\//],
    ignoredDirs: ['vendor', '.phpunit.cache'],
    docstringPattern: {
      commentRegex: /^\/\*\*/,
      style: 'block_comment',
    },
    visibilityRules: {
      defaultVisibility: 'public',
      exportDetection: 'modifier_keyword',
      modifiers: ['public', 'protected', 'private'],
    },
    importNodeTypes: ['namespace_use_declaration', 'use_declaration'],
    symbolNodeTypes: {
      function: 'function_definition',
      class: 'class_declaration',
      interface: 'interface_declaration',
      trait: 'trait_declaration',
      enum: 'enum_declaration',
      method: 'method_declaration',
      module: 'namespace_definition',
    },
  },

  kotlin: {
    languageId: 'kotlin',
    extensions: ['.kt', '.kts'],
    testPatterns: [/Test\.kt$/, /Tests\.kt$/, /src\/test\//],
    ignoredDirs: ['build', '.gradle', '.idea'],
    docstringPattern: {
      commentRegex: /^\/\*\*/,
      style: 'block_comment',
    },
    visibilityRules: {
      defaultVisibility: 'public',
      exportDetection: 'modifier_keyword',
      modifiers: ['public', 'private', 'protected', 'internal'],
    },
    importNodeTypes: ['import_header'],
    symbolNodeTypes: {
      function: 'function_declaration',
      class: 'class_declaration',
      property: 'property_declaration',
      variable: 'variable_declaration',
      type_alias: 'type_alias',
    },
  },

  swift: {
    languageId: 'swift',
    extensions: ['.swift'],
    testPatterns: [/Tests\.swift$/, /Tests\//],
    ignoredDirs: ['.build', 'DerivedData', 'Pods', '.swiftpm'],
    docstringPattern: {
      commentRegex: /^\/\/\/|^\/\*\*/,
      style: 'line_comment',
    },
    visibilityRules: {
      defaultVisibility: 'internal',
      exportDetection: 'modifier_keyword',
      modifiers: ['open', 'public', 'internal', 'fileprivate', 'private'],
    },
    importNodeTypes: ['import_declaration'],
    symbolNodeTypes: {
      function: 'function_declaration',
      class: 'class_declaration',
      struct: 'struct_declaration',
      enum: 'enum_declaration',
      trait: 'protocol_declaration',
      property: 'property_declaration',
    },
  },

  csharp: {
    languageId: 'csharp',
    extensions: ['.cs'],
    testPatterns: [/Tests\.cs$/, /Test\.cs$/, /\.Tests\//],
    ignoredDirs: ['bin', 'obj', 'packages', '.vs'],
    docstringPattern: {
      commentRegex: /^\/\/\//,
      style: 'line_comment',
    },
    visibilityRules: {
      defaultVisibility: 'internal',
      exportDetection: 'modifier_keyword',
      modifiers: ['public', 'internal', 'protected', 'private', 'protected internal', 'private protected'],
    },
    importNodeTypes: ['using_directive'],
    symbolNodeTypes: {
      class: 'class_declaration',
      struct: 'struct_declaration',
      interface: 'interface_declaration',
      enum: 'enum_declaration',
      method: 'method_declaration',
      property: 'property_declaration',
      module: 'namespace_declaration',
    },
  },

  lua: {
    languageId: 'lua',
    extensions: ['.lua'],
    testPatterns: [/_test\.lua$/, /_spec\.lua$/, /spec\//],
    ignoredDirs: ['lua_modules', '.luarocks'],
    docstringPattern: {
      commentRegex: /^---/,
      style: 'triple_dash',
    },
    visibilityRules: {
      defaultVisibility: 'public',
      exportDetection: 'return_table',
      modifiers: [],
    },
    importNodeTypes: ['function_call'],
    symbolNodeTypes: {
      function: 'function_declaration',
      variable: 'variable_declaration',
    },
  },
}

// ── Derived constants ────────────────────────────────────

export const SUPPORTED_LANGUAGES: string[] = Object.keys(LANGUAGE_REFERENCES)
