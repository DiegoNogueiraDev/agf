---
number: 3
title: ADR-0011: Semantic Test Coverage via AST Import Analysis
date: 2026-06-22
status: Accepted
---

# ADR-0003: ADR-0011: Semantic Test Coverage via AST Import Analysis

## Status

Accepted

## Context

foo.test.ts sem import de foo.ts não cobre foo.ts. Analogia imunológica: anticorpo sem ligação ao antígeno não confere proteção (Burnet, 1959). Harness atual usa stem-matching — foo.test.ts cobre foo.ts independente do conteúdo.

## Decision

Verificar cobertura real de módulos via análise de import statements nos arquivos de teste (AST tree-sitter) em vez de stem-matching. Expor duas métricas: arquivo_de_teste_existe e modulo_realmente_importado. Coverage real = interseção.

## Consequences

Positivas: métrica real de cobertura substitui proxy fraco; detecção de testes fantasma. Negativas: análise AST é ~5x mais lenta que regex — restrita ao agf harness, não ao hot-path de check/done. Requer tree-sitter ou regex de import (já disponível no projeto).
