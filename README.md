# devin-api-mcp

A lightweight MCP server for interacting with the Devin API.

The existing [Devin MCP](https://docs.devin.ai/work-with-devin/devin-mcp) server only supports documentation/wiki lookups and asking questions about repositories. This server instead provides **full Devin API coverage** — manage sessions, knowledge, playbooks, secrets, and attachments programmatically from any MCP client.

## Setup

### 1. Get your API key

Follow the [Devin API authentication guide](https://docs.devin.ai/api-reference/authentication) to generate an API key.

### 2. Register with Claude Code

```bash
claude mcp add -s user -e DEVIN_API_KEY=<your-api-key-here> -- devin-api npx -y @jsklan/devin-api-mcp
```

### Alternative: Install as a Claude Code plugin

1. Run `/plugin` in Claude Code
2. Go to **Marketplaces** → **+ Add Marketplace**
3. Enter `jsklan/devin-api-mcp`
4. Go to **Discover**, find **devin-api**, and install it

Make sure `DEVIN_API_KEY` is set in your environment. The plugin will start the MCP server automatically and stay up to date.

### 3. Register with other MCP clients

Add to your MCP config (e.g. `mcp.json`):

```json
{
  "mcpServers": {
    "devin-api": {
      "command": "npx",
      "args": ["-y", "@jsklan/devin-api-mcp"],
      "env": {
        "DEVIN_API_KEY": "your_key_here"
      }
    }
  }
}
```

## Tools

### Sessions
| Tool | Description |
|------|-------------|
| `create_session` | Start a new Devin session with a prompt (supports playbooks, tags, knowledge, secrets, structured output) |
| `list_sessions` | List recent sessions with status and metadata (filterable by tags, user) |
| `get_session` | Get session details including messages and structured output |
| `send_message` | Send a follow-up message to a running session |
| `terminate_session` | Stop a running session |
| `update_session_tags` | Replace tags on a session |

### Knowledge
| Tool | Description |
|------|-------------|
| `list_knowledge` | List all knowledge entries and folders |
| `create_knowledge` | Create a knowledge entry (teaches Devin domain-specific info) |
| `update_knowledge` | Update an existing knowledge entry |
| `delete_knowledge` | Permanently delete a knowledge entry |

### Playbooks
| Tool | Description |
|------|-------------|
| `list_playbooks` | List available playbooks (titles and IDs) |
| `get_playbook` | Get full playbook details |
| `create_playbook` | Create a new team playbook |
| `update_playbook` | Update an existing playbook |
| `delete_playbook` | Delete a team playbook |

### Secrets
| Tool | Description |
|------|-------------|
| `list_secrets` | List secret metadata (values are never returned) |
| `create_secret` | Create a new encrypted secret |
| `delete_secret` | Permanently delete a secret |

### Attachments
| Tool | Description |
|------|-------------|
| `upload_attachment` | Upload a file for use in sessions (returns URL for `ATTACHMENT:"<url>"` format) |

## API Coverage

This server wraps the [Devin REST API v1](https://docs.devin.ai/api-reference/v1/overview.md). Covers sessions, messages, knowledge, playbooks, secrets, and attachments. Written in TypeScript with Zod schema validation.

## License

MIT
