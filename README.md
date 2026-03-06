# devin-api-mcp

A lightweight MCP server for interacting with the Devin API.

The existing [Devin MCP](https://docs.devin.ai/work-with-devin/devin-mcp) server only supports documentation/wiki lookups and asking questions about repositories. This server instead provides **session management** — create, monitor, message, and terminate Devin sessions programmatically from any MCP client.

## Tools

| Tool | Description |
|------|-------------|
| `create_session` | Start a new Devin session with a prompt |
| `list_sessions` | List recent sessions with status and metadata |
| `get_session` | Get session details including messages |
| `send_message` | Send a follow-up message to a running session |
| `terminate_session` | Stop a running session |
| `list_playbooks` | List available playbooks (for use with `create_session`) |

## Setup

### 1. Get your API key

Generate a Devin API key from your [Devin account settings](https://app.devin.ai/settings).

### 2. Register with Claude Code (one-liner)

```bash
claude mcp add -s user -e DEVIN_API_KEY=your_key_here devin-api npx @jsklan/devin-api-mcp
```

Or if `DEVIN_API_KEY` is already in your environment:

```bash
claude mcp add -s user devin-api npx @jsklan/devin-api-mcp
```

### Alternative: Install from source

```bash
git clone https://github.com/jsklan/devin-api-mcp.git
cd devin-api-mcp
npm install
claude mcp add -s user devin-api node /absolute/path/to/devin-api-mcp/index.js
```

### 4. Register with other MCP clients

Add to your MCP config (e.g. `mcp.json`):

```json
{
  "mcpServers": {
    "devin-api": {
      "command": "node",
      "args": ["/absolute/path/to/devin-api-mcp/index.js"],
      "env": {
        "DEVIN_API_KEY": "your_key_here"
      }
    }
  }
}
```

## API Coverage

This server wraps the [Devin REST API v1](https://docs.devin.ai/api-reference/v1/overview.md). Currently covers sessions, messages, and playbooks. Additional endpoints (knowledge, secrets, attachments) can be added as needed.

## License

MIT
