# devin-api-mcp

MCP servers for the Devin REST API. TypeScript, built with `@modelcontextprotocol/sdk` and `zod`.

## Build & Run

```bash
npm run build      # tsc → dist/
npm run start:v1   # node dist/v1.js (legacy v1 API)
npm run start:v3   # node dist/v3.js (v3 organization API)
```

## Two-Server Architecture

This package exposes two MCP servers:

- **devin-api-v1** (`src/v1.ts`) — Legacy v1 API (19 tools). Uses `DEVIN_PERSONAL_API_KEY` (or `DEVIN_API_KEY` for backward compat). Personal API keys with `apk_user_` prefix.
- **devin-api-v3** (`src/v3.ts`) — v3 Organization API (33 tools). Uses `DEVIN_SERVICE_API_KEY`. Service user keys with `cog_` prefix. Auto-discovers `org_id` via `/v3/self` at startup.

The v1/v3 split mirrors Devin's actual API versioning. Enterprise endpoints (`/v3/enterprise/...`) and beta endpoints (`/v3beta1/...`) are intentionally excluded.

## Project Structure

```
src/
  v1.ts              — v1 server (legacy, all-in-one)
  v3.ts              — v3 server entry point
  v3/
    shared.ts         — v3 fetch helper, org_id init, pagination types
    sessions.ts       — session tools (14)
    knowledge.ts      — knowledge tools (4)
    playbooks.ts      — playbook tools (5)
    secrets.ts        — secrets tools (3)
    schedules.ts      — schedule tools (5)
    attachments.ts    — attachment tools (2)
```

- `dist/` — compiled output (gitignored)
- Published as `@jsklan/devin-api-mcp` on npm

## Key Patterns

- v1: All API calls go through `devinFetch()` / `devinFetchFormData()` helpers
- v3: All API calls go through `v3Fetch()` / `v3FetchFormData()` / `v3FetchArrayQuery()` from `src/v3/shared.ts`
- v3 paths are relative to `/v3/organizations/{org_id}/` — the org_id is auto-prepended
- Tool schemas use Zod (imported from `zod`)
- v3 list endpoints use cursor-based pagination (`after`/`first`) except schedules (offset-based)
- Each v3 category file exports a `registerXTools(server)` function called from `src/v3.ts`

## Tools

- **v1:** 19 tools across 5 categories: Sessions (6), Knowledge (4), Playbooks (5), Secrets (3), Attachments (1)
- **v3:** 33 tools across 6 categories: Sessions (14), Knowledge (4), Playbooks (5), Secrets (3), Schedules (5), Attachments (2)
