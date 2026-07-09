.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available make targets.
	@echo "Available make targets:"
	@awk 'BEGIN { FS = ":.*## " } /^[A-Za-z0-9_.-]+:.*## / { printf "  %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: install
install: ## Install project dependencies.
	npm ci

.PHONY: prepare
prepare: ## Install deps and setup git hooks.
	npm ci && npm run prepare

.PHONY: build
build: ## Build the project with bun build.
	bun run build

.PHONY: dev
dev: ## Run the CLI in development mode.
	npm run dev

.PHONY: format
format: ## Auto-format sources with eslint --fix.
	npm run lint:fix

.PHONY: check
check: ## Run linting and type checking.
	npm run lint && npm run typecheck

.PHONY: test
test: ## Run full test suite with vitest.
	npm test

.PHONY: test-blast
test-blast: ## Run tests for changed files only.
	npm run test:blast

.PHONY: test-smoke
test-smoke: ## Run smoke test suite.
	npm run test:smoke

.PHONY: test-node
test-node: ## Run node project tests only.
	npm run test:node

.PHONY: ci
ci: ## Run CI smoke checks.
	npm run ci:smoke

.PHONY: harness
harness: ## Run harnessability scan.
	npm run harness:scan

.PHONY: clean
clean: ## Clean build artifacts and caches.
	rm -rf dist/ coverage/ node_modules/.cache
