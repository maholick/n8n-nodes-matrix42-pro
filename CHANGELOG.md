# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-23

### Added

- Added Vitest unit and operation tests for helpers, authentication, API errors, pagination, payload builders, attachment uploads, dynamic options, and AI-tool read-only behavior.
- Added dynamic template, folder, attribute, file-attribute, and static-value loading from Matrix42 Pro REST API metadata.
- Added the read-only `Matrix42 Pro AI Tool` node for n8n Tools Agent workflows.
- Added example workflows for AI ticket search and human-reviewed ticket updates.
- Added `test`, `test:watch`, and `check` scripts.

### Changed

- Refactored operation execution into testable internal modules shared by the full workflow node and tests.
- Updated CI and `prepublishOnly` to run build, lint, tests, production audit, and pack dry-run.
- Adjusted tool descriptions to steer AI-agent workflows toward the read-only AI Tool node.

## [0.2.0] - 2026-06-23

### Added

- Rebranded the package and nodes as Matrix42 Pro community nodes.
- Added resource/operation UX for templates, data cards, attributes, attachments, utilities, and polling.
- Added n8n codex metadata and light/dark SVG icons.
- Added field-builder and raw JSON modes for data-card writes.

### Changed

- Updated the stack to current `@n8n/node-cli`, ESLint flat config, TypeScript, Prettier, and pnpm workspace settings.
- Replaced deprecated request helpers with `helpers.httpRequest`.
- Renamed credentials to `Matrix42 Pro API` and added configurable API path support for cloud and on-premises environments.

### Removed

- Removed the legacy Efecte ESM node implementation and TSLint/ESLint v8 configuration.

## [0.1.0] - 2025-12-15

### Added

- Initial release of n8n-nodes-efecte
- Efecte ESM API integration nodes for n8n
- Support for n8n 2.0+ compatibility
- Comprehensive API operations for Efecte ESM
- GitHub Actions workflow for automated releases

### Changed

- Updated axios and form-data dependencies with pnpm overrides

### Fixed

- Fixed duplicate parameter bug
- Fixed binary data type handling
