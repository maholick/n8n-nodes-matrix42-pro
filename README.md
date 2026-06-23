# n8n-nodes-matrix42-pro

Matrix42 Pro community nodes for n8n.

This package connects n8n workflows to the Matrix42 Pro / Efecte Service Management REST API. The product branding has moved toward Matrix42, but the REST API still uses Efecte-style paths such as `/rest-api/itsm/v1`, so the node keeps those API terms where they matter technically.

This is an unofficial community integration. It is not affiliated with, endorsed by, or sponsored by Matrix42 AG, Efecte Oyj, or their subsidiaries.

## What is included

- `Matrix42 Pro`: action node for templates, data cards, attributes, attachments, and API echo checks.
- `Matrix42 Pro Trigger`: polling trigger for new matching data cards.
- `Matrix42 Pro API`: credentials for local ESM users with External API permission.
- Light and dark SVG icons, n8n codex metadata, current `@n8n/node-cli` build/lint/release scripts, and pnpm 11 workspace configuration.

## Requirements

- n8n with community nodes enabled
- Node.js `>=20.19`
- A Matrix42 Pro / Efecte Service Management environment with the REST API module enabled
- A local ESM user with a role that has External API permission plus the needed folder and template permissions

Cloud environments commonly use:

```text
/rest-api/itsm/v1
```

On-premises environments may use:

```text
/itsm/api/v1
```

## Installation

Install the community package in n8n by package name:

```text
n8n-nodes-matrix42-pro
```

For local development:

```bash
corepack enable
corepack pnpm install
corepack pnpm build
corepack pnpm dev
```

## Credentials

Create a `Matrix42 Pro API` credential with:

| Field                           | Description                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Instance URL                    | Base URL of your environment, for example `https://your-instance.efectecloud.com` |
| API Path                        | API root path, usually `/rest-api/itsm/v1` for cloud                              |
| Username                        | Local ESM account with External API permission                                    |
| Password                        | Password for that local ESM account                                               |
| Allow Unauthorized Certificates | Development/on-premises escape hatch for self-signed TLS certificates             |

The node logs in through `POST /users/login` and uses the JWT bearer token returned in the response headers. The API documentation notes a default token lifetime of 15 minutes.

## Operations

### Template

| Operation | API endpoint             |
| --------- | ------------------------ |
| Get Many  | `GET /dc`                |
| Get       | `GET /dc/{templateCode}` |

Use these operations first when building workflows. Matrix42 templates and attribute codes are customer-specific, so discovery is more reliable than hard-coding incident/request assumptions.

### Data Card

| Operation   | API endpoint                                  |
| ----------- | --------------------------------------------- |
| List        | `GET /dc/{templateCode}/data`                 |
| Stream      | `GET /dc/{templateCode}/data/stream`          |
| Get         | `GET /dc/{templateCode}/data/{dataCardId}`    |
| Create      | `POST /dc/{templateCode}/data`                |
| Update      | `PATCH /dc/{templateCode}/data/{dataCardId}`  |
| Delete      | `DELETE /dc/{templateCode}/data/{dataCardId}` |
| Bulk Import | `PUT /dc/{templateCode}/data`                 |

List supports EQL filters, selected attributes, full data-card responses, `filterId`, and automatic pagination. The API page size is capped at 200; the node paginates until the requested limit is reached.

Create and Update support two input modes:

- Field Builder: add one row per value. Reuse the same attribute code to send multiple values.
- Raw JSON: paste the Matrix42 REST API `data` object directly for advanced payloads.

### Attribute

| Operation | API endpoint                                                  |
| --------- | ------------------------------------------------------------- |
| Get       | `GET /dc/{templateCode}/data/{dataCardId}/{attributeCode}`    |
| Replace   | `PUT /dc/{templateCode}/data/{dataCardId}/{attributeCode}`    |
| Add Value | `POST /dc/{templateCode}/data/{dataCardId}/{attributeCode}`   |
| Clear     | `DELETE /dc/{templateCode}/data/{dataCardId}/{attributeCode}` |

Supported value shapes include string/date/worklog values, numbers, references, static values, and external references.

### Attachment

| Operation | API endpoint                                                               |
| --------- | -------------------------------------------------------------------------- |
| Upload    | `POST /dc/{templateCode}/data/{dataCardId}/{attributeCode}/file`           |
| Download  | `GET /dc/{templateCode}/data/{dataCardId}/{attributeCode}/file/{location}` |

Use the file `location` returned by an external-reference attribute for downloads.

### Utility

| Operation     | API endpoint    |
| ------------- | --------------- |
| Echo          | `GET /echo`     |
| Echo With JWT | `GET /echo/jwt` |

## Trigger

`Matrix42 Pro Trigger` polls the latest data cards for a template and emits cards whose IDs have not been seen by that workflow node before.

Options:

- EQL filter
- Selected attributes
- Full data-card responses
- Poll inspection limit, up to 200
- Emit existing data on first poll

By default, the first poll records the current matching cards without emitting them. This prevents newly activated workflows from processing old data unexpectedly.

## EQL examples

```text
$status$ = '02 - Solving'
$priority$ = '2. High'
$created$ > 'now - 2w'
$support_group$ = 'IT Support' AND $status$ <> '07 - Closed'
```

Use `Template > Get` to inspect valid attribute codes for your environment.

## Development

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm lint
corepack pnpm lint:fix
corepack pnpm dev
```

The project follows the current n8n community-node package shape:

- `eslint.config.mjs` delegates to `@n8n/node-cli/eslint`
- `package.json` contains `n8n.credentials`, `n8n.nodes`, and `n8n.strict`
- node codex files provide categories and documentation links
- `prepublishOnly` runs build and lint before npm publish

## Source API reference

The implementation is based on the supplied Matrix42/Efecte OpenAPI document and the Efecte Service Management Tool REST API PDF. Those references describe 11 REST paths under `/rest-api/itsm/v1`.

## Trademark notice

Matrix42 and Efecte are trademarks of their respective owners. This package is an unofficial community integration provided as-is.
