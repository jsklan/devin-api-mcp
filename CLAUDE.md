# devin-api-mcp

MCP server for the Devin REST API v1. TypeScript, built with `@modelcontextprotocol/sdk` and `zod`.

## Build & Run

```bash
npm run build    # tsc → dist/
npm start        # node dist/index.js
```

## Project Structure

- `src/index.ts` — single-file server; all tools, types, and helpers
- `dist/` — compiled output (gitignored)
- Published as `@jsklan/devin-api-mcp` on npm

## Key Patterns

- All API calls go through `devinFetch()` / `devinFetchFormData()` helpers
- `DEVIN_API_KEY` env var required at runtime
- Tool schemas use Zod (imported from `zod`)
- Server includes `instructions` field with guidance to disambiguate from the DeepWiki Devin MCP

## Tools

19 tools across 5 categories: Sessions (6), Knowledge (4), Playbooks (5), Secrets (3), Attachments (1).
