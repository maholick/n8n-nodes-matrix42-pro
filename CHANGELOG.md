# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
