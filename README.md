# devin-api-mcp

Two MCP servers providing **full Devin API coverage** — manage sessions, knowledge, playbooks, secrets, schedules, and attachments programmatically from any MCP client.

The existing [Devin MCP](https://docs.devin.ai/work-with-devin/devin-mcp) server only supports documentation/wiki lookups and asking questions about repositories. This package gives you everything else.

## Two-Server Architecture

This package exposes two MCP servers mirroring Devin's API versioning:

- **devin-api-v1** — Legacy v1 API (19 tools). Uses a **personal API key** (`apk_user_` prefix).
- **devin-api-v3** — v3 Organization API (33 tools). Uses a **service user key** (`cog_` prefix). Auto-discovers your `org_id` at startup via `/v3/self`.

## Setup

### 1. Get your API keys

Follow the [Devin API authentication guide](https://docs.devin.ai/api-reference/authentication) to generate your keys:

| Server | Environment Variable | Key Prefix | Where to Get It |
|--------|---------------------|------------|-----------------|
| v1 | `DEVIN_PERSONAL_API_KEY` | `apk_user_` | Devin account settings |
| v3 | `DEVIN_SERVICE_API_KEY` | `cog_` | Devin organization settings |

> **Note:** The v1 server also accepts `DEVIN_API_KEY` as a fallback for backward compatibility.

### 2. Register with Claude Code

```bash
# v1 (personal API — sessions, knowledge, playbooks, secrets, attachments)
claude mcp add -s user -e DEVIN_PERSONAL_API_KEY=<your-personal-key> -- devin-api-v1 npx -y -p @jsklan/devin-api-mcp devin-api-v1

# v3 (organization API — adds schedules, more session tools)
claude mcp add -s user -e DEVIN_SERVICE_API_KEY=<your-service-key> -- devin-api-v3 npx -y -p @jsklan/devin-api-mcp devin-api-v3
```

### Alternative: Install as a Claude Code plugin

1. Run `/plugin` in Claude Code
2. Go to **Marketplaces** → **+ Add Marketplace**
3. Enter `jsklan/devin-api-mcp`
4. Go to **Discover**, find **devin-api**, and install it

Make sure `DEVIN_PERSONAL_API_KEY` and/or `DEVIN_SERVICE_API_KEY` are set in your environment. The plugin will start the MCP servers automatically and stay up to date.

### 3. Register with other MCP clients

Add to your MCP config (e.g. `mcp.json`):

```json
{
  "mcpServers": {
    "devin-api-v1": {
      "command": "npx",
      "args": ["-y", "-p", "@jsklan/devin-api-mcp", "devin-api-v1"],
      "env": {
        "DEVIN_PERSONAL_API_KEY": "your_personal_key_here"
      }
    },
    "devin-api-v3": {
      "command": "npx",
      "args": ["-y", "-p", "@jsklan/devin-api-mcp", "devin-api-v3"],
      "env": {
        "DEVIN_SERVICE_API_KEY": "your_service_key_here"
      }
    }
  }
}
```

## Tools

### v1 Server (19 tools)

#### Sessions
| Tool | Description |
|------|-------------|
| `create_session` | Start a new Devin session with a prompt (supports playbooks, tags, knowledge, secrets, structured output) |
| `list_sessions` | List recent sessions with status and metadata (filterable by tags, user) |
| `get_session` | Get session details including messages and structured output |
| `send_message` | Send a follow-up message to a running session |
| `terminate_session` | Stop a running session |
| `update_session_tags` | Replace tags on a session |

#### Knowledge
| Tool | Description |
|------|-------------|
| `list_knowledge` | List all knowledge entries and folders |
| `create_knowledge` | Create a knowledge entry (teaches Devin domain-specific info) |
| `update_knowledge` | Update an existing knowledge entry |
| `delete_knowledge` | Permanently delete a knowledge entry |

#### Playbooks
| Tool | Description |
|------|-------------|
| `list_playbooks` | List available playbooks (titles and IDs) |
| `get_playbook` | Get full playbook details |
| `create_playbook` | Create a new team playbook |
| `update_playbook` | Update an existing playbook |
| `delete_playbook` | Delete a team playbook |

#### Secrets
| Tool | Description |
|------|-------------|
| `list_secrets` | List secret metadata (values are never returned) |
| `create_secret` | Create a new encrypted secret |
| `delete_secret` | Permanently delete a secret |

#### Attachments
| Tool | Description |
|------|-------------|
| `upload_attachment` | Upload a file for use in sessions (returns URL for `ATTACHMENT:"<url>"` format) |

### v3 Server (33 tools)

The v3 server includes all the same categories as v1 (with expanded session tools) plus **schedules** and an additional attachment tool. All operations are scoped to your organization.

#### Sessions (14 tools)
Expanded session management including listing by status, bulk operations, and session events.

#### Knowledge (4 tools)
Same as v1 — list, create, update, delete.

#### Playbooks (5 tools)
Same as v1 — list, get, create, update, delete.

#### Secrets (3 tools)
Same as v1 — list, create, delete.

#### Schedules (5 tools)
| Tool | Description |
|------|-------------|
| `list_schedules` | List scheduled Devin sessions |
| `get_schedule` | Get schedule details |
| `create_schedule` | Create a recurring scheduled session |
| `update_schedule` | Update an existing schedule |
| `delete_schedule` | Delete a schedule |

#### Attachments (2 tools)
Upload and manage files for use in sessions.

## API Coverage

- **v1 server** wraps the [Devin REST API v1](https://docs.devin.ai/api-reference/v1/overview.md) — 19 tools across 5 categories.
- **v3 server** wraps the Devin REST API v3 — 33 tools across 6 categories. Enterprise (`/v3/enterprise/...`) and beta (`/v3beta1/...`) endpoints are intentionally excluded.

Written in TypeScript with Zod schema validation.

## License

MIT
