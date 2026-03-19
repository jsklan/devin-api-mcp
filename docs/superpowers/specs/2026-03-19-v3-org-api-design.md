# Devin API v3 Organization Endpoints — Design Spec

## Goal

Add a second MCP server (`devin-api-v3`) exposing all non-beta, org-scoped Devin v3 API endpoints alongside the existing v1 server.

## Context

The current MCP server implements the Devin v1 (legacy) API — 19 tools using personal API keys (`apk_user_`). The v3 API is the current version, org-scoped, and uses service user credentials (`cog_` prefix). This project adds a new server for v3 while keeping v1 intact.

**Intentionally excluded:**
- Enterprise API (`/v3/enterprise/...`) — cross-org admin features, not needed for single-org use
- Beta endpoints (`/v3beta1/...`) — Repositories, Guardrail Violations, Provision Service User
- Legacy v2 API

**Note:** The two-server split (v1 vs v3) reflects the actual Devin API versioning. There is no custom organizational split.

## Architecture

### Two Servers, One Package

| Server | Entry Point | Env Var | API Base |
|--------|-------------|---------|----------|
| `devin-api-v1` | `dist/v1.js` | `DEVIN_PERSONAL_API_KEY` | `https://api.devin.ai/v1/` |
| `devin-api-v3` | `dist/v3.js` | `DEVIN_SERVICE_API_KEY` | `https://api.devin.ai/v3/organizations/{org_id}/` |

### Org ID Discovery

The v3 server calls `GET /v3/self` at startup using `DEVIN_SERVICE_API_KEY` to resolve the `org_id`. This is cached for the server's lifetime. If the call fails, the server exits with a clear error message.

### File Structure

```
src/
  v1.ts              — v1 server (extracted from current index.ts, env var renamed)
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

### Shared v3 Infrastructure (`src/v3/shared.ts`)

- `initOrgContext()` — calls `/v3/self`, caches `org_id`
- `v3Fetch(path, options)` — like existing `devinFetch` but:
  - Uses `DEVIN_SERVICE_API_KEY`
  - Prepends `/v3/organizations/{org_id}` to all paths
  - Same error handling pattern
- `v3FetchFormData(path, formData)` — for attachment upload
- Shared Zod schemas for pagination params (`after`, `first`)
- TypeScript types for common response shapes (paginated envelope, etc.)

### Plugin Configuration

The `.claude-plugin/plugin.json` registers both servers. Each server gets its own `instructions` field to help LLMs pick the right one.

## v3 Tool Inventory (33 tools)

### Sessions (14)
| Tool Name | Method | Path |
|-----------|--------|------|
| `create_session` | POST | `/sessions` |
| `list_sessions` | GET | `/sessions` |
| `get_session` | GET | `/sessions/{devin_id}` |
| `delete_session` | DELETE | `/sessions/{devin_id}` |
| `send_message` | POST | `/sessions/{devin_id}/messages` |
| `get_messages` | GET | `/sessions/{devin_id}/messages` |
| `add_session_tags` | POST | `/sessions/{devin_id}/tags` |
| `replace_session_tags` | PUT | `/sessions/{devin_id}/tags` |
| `get_session_tags` | GET | `/sessions/{devin_id}/tags` |
| `get_session_insights` | GET | `/sessions/{devin_id}/insights` |
| `list_session_insights` | GET | `/sessions/insights` |
| `generate_session_insights` | POST | `/sessions/{devin_id}/insights/generate` |
| `get_session_attachments` | GET | `/sessions/{devin_id}/attachments` |
| `archive_session` | POST | `/sessions/{devin_id}/archive` |

### Knowledge (4)
| Tool Name | Method | Path |
|-----------|--------|------|
| `list_knowledge` | GET | `/knowledge/notes` |
| `create_knowledge` | POST | `/knowledge/notes` |
| `update_knowledge` | PUT | `/knowledge/notes/{note_id}` |
| `delete_knowledge` | DELETE | `/knowledge/notes/{note_id}` |

### Playbooks (5)
| Tool Name | Method | Path |
|-----------|--------|------|
| `list_playbooks` | GET | `/playbooks` |
| `create_playbook` | POST | `/playbooks` |
| `get_playbook` | GET | `/playbooks/{playbook_id}` |
| `update_playbook` | PUT | `/playbooks/{playbook_id}` |
| `delete_playbook` | DELETE | `/playbooks/{playbook_id}` |

### Secrets (3)
| Tool Name | Method | Path |
|-----------|--------|------|
| `list_secrets` | GET | `/secrets` |
| `create_secret` | POST | `/secrets` |
| `delete_secret` | DELETE | `/secrets/{secret_id}` |

### Schedules (5)
| Tool Name | Method | Path |
|-----------|--------|------|
| `list_schedules` | GET | `/schedules` |
| `create_schedule` | POST | `/schedules` |
| `get_schedule` | GET | `/schedules/{schedule_id}` |
| `update_schedule` | PATCH | `/schedules/{schedule_id}` |
| `delete_schedule` | DELETE | `/schedules/{schedule_id}` |

### Attachments (2)
| Tool Name | Method | Path |
|-----------|--------|------|
| `upload_attachment` | POST | `/attachments` |
| `get_attachment` | GET | `/attachments/{uuid}/{name}` |

## API Schema Details

### Pagination (all list endpoints)
- Query: `after` (cursor string, optional), `first` (int, 1-200, default 100)
- Response: `{ items: T[], end_cursor: string|null, has_next_page: boolean, total: integer|null }`

### Sessions — Key Types

**SessionResponse:** `session_id`, `url`, `status` (new|claimed|running|exit|error|suspended|resuming), `status_detail`, `tags` (string[]), `org_id`, `created_at` (int), `updated_at` (int), `acus_consumed` (number), `pull_requests` ({pr_url, pr_state}[]), `is_advanced` (bool), `is_archived` (bool), `title`, `playbook_id`, `user_id`, `service_user_id`, `parent_session_id`, `child_session_ids`, `structured_output`

**Create session body:** `prompt` (required), `title`, `tags`, `playbook_id`, `knowledge_ids`, `secret_ids`, `session_secrets` ({key, value, sensitive}[]), `max_acu_limit`, `structured_output_schema`, `attachment_urls`, `repos`, `advanced_mode` (analyze|create|improve|batch|manage), `bypass_approval`, `create_as_user_id`, `child_playbook_id`, `session_links`

**List sessions query:** `session_ids`, `created_after`, `created_before`, `updated_after`, `updated_before`, `tags`, `playbook_id`, `origins` (webapp|cli|slack|teams|api|linear|jira|scheduled|other), `schedule_id`, `user_ids`, `service_user_ids` + pagination

**Delete session query:** `archive` (boolean, default false)

**Send message body:** `message` (required), `message_as_user_id` (optional)

**SessionMessage:** `event_id`, `source` (devin|user), `message`, `created_at`

**SessionInsightsResponse:** all SessionResponse fields + `num_user_messages`, `num_devin_messages`, `session_size` (xs|s|m|l|xl), `analysis` (AI-generated, nullable)

**SessionAttachment:** `attachment_id`, `name`, `url`, `source` (devin|user), `content_type` (optional)

### Knowledge — KnowledgeNoteResponse
`note_id`, `folder_id` (nullable), `name`, `body`, `trigger`, `is_enabled`, `created_at`, `updated_at`, `access_type` (enterprise|org), `org_id` (nullable), `pinned_repo` (nullable)

Create/Update body: `name`, `body`, `trigger` (all required), `pinned_repo` (optional, nullable)

### Playbooks — PlaybookResponse
`playbook_id`, `title`, `body`, `macro` (nullable), `created_by`, `updated_by`, `created_at`, `updated_at`, `access_type` (enterprise|org), `org_id` (nullable)

Create/Update body: `title`, `body` (required), `macro` (optional, nullable)

### Secrets — SecretResponse
`secret_id`, `key` (nullable), `note` (nullable), `is_sensitive`, `created_by`, `created_at`, `secret_type` (cookie|key-value|totp), `access_type` (org|personal)

Create body: `type` (cookie|key-value|totp, required), `key` (required), `value` (required), `is_sensitive` (optional, default true), `note` (optional, nullable)

### Schedules — ScheduleResponse
`scheduled_session_id`, `org_id`, `created_by` (nullable), `name`, `prompt`, `playbook` ({playbook_id, title} nullable), `frequency` (cron, nullable), `enabled`, `agent` (devin|data_analyst|advanced), `notify_on` (always|failure|never), `schedule_type` (recurring|one_time), `last_executed_at`, `scheduled_at`, `last_error_at`, `last_error_message`, `consecutive_failures`, `created_at`, `updated_at`, `slack_channel_id`, `slack_team_id`

Create body: `name`, `prompt` (required), `agent`, `schedule_type`, `frequency`, `scheduled_at`, `playbook_id`, `notify_on`, `create_as_user_id`, `slack_channel_id`, `slack_team_id`

Update body (all optional): `name`, `enabled`, `schedule_type`, `frequency`, `scheduled_at`, `prompt`, `playbook_id`, `agent`, `notify_on`, `run_as_user_id`, `slack_channel_id`, `slack_team_id`

### Attachments
Upload: multipart form data with `file` field. Response: `{ attachment_id, name, url }`
Get: returns 200 empty body or 307 redirect to presigned download URL
