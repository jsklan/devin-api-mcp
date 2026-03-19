import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { formatPaginatedResponse, paginationParams, v3Fetch, v3FetchArrayQuery } from './shared.js'

// --- Session formatting ---

interface SessionResponse {
	session_id: string
	url?: string
	status?: string
	status_detail?: string
	tags?: string[]
	org_id?: string
	created_at?: number
	updated_at?: number
	acus_consumed?: number
	pull_requests?: { pr_url: string; pr_state: string }[]
	is_advanced?: boolean
	is_archived?: boolean
	title?: string
	playbook_id?: string
	user_id?: string
	service_user_id?: string
	parent_session_id?: string
	child_session_ids?: string[]
	structured_output?: unknown
}

function formatSession(s: SessionResponse): string {
	const parts = [
		`Session: ${s.session_id}`,
		`Status: ${s.status || 'unknown'}${s.status_detail ? ` (${s.status_detail})` : ''}`,
		`Title: ${s.title || '(untitled)'}`,
	]
	if (s.url) {
		parts.push(`URL: ${s.url}`)
	}
	if (s.created_at) {
		parts.push(`Created: ${new Date(s.created_at * 1000).toISOString()}`)
	}
	if (s.updated_at) {
		parts.push(`Updated: ${new Date(s.updated_at * 1000).toISOString()}`)
	}
	if (s.acus_consumed !== undefined) {
		parts.push(`ACUs consumed: ${s.acus_consumed}`)
	}
	if (s.tags?.length) {
		parts.push(`Tags: ${s.tags.join(', ')}`)
	}
	if (s.pull_requests?.length) {
		const prs = s.pull_requests.map((pr) => `${pr.pr_url} (${pr.pr_state})`).join(', ')
		parts.push(`PRs: ${prs}`)
	}
	if (s.is_advanced) {
		parts.push(`Advanced: yes`)
	}
	if (s.is_archived) {
		parts.push(`Archived: yes`)
	}
	if (s.playbook_id) {
		parts.push(`Playbook: ${s.playbook_id}`)
	}
	if (s.user_id) {
		parts.push(`User: ${s.user_id}`)
	}
	if (s.service_user_id) {
		parts.push(`Service user: ${s.service_user_id}`)
	}
	if (s.parent_session_id) {
		parts.push(`Parent session: ${s.parent_session_id}`)
	}
	if (s.child_session_ids?.length) {
		parts.push(`Child sessions: ${s.child_session_ids.join(', ')}`)
	}
	if (s.structured_output) {
		parts.push(`Structured output:\n${JSON.stringify(s.structured_output, null, 2)}`)
	}
	return parts.join('\n')
}

// --- Common filter params for list_sessions and list_session_insights ---

const sessionFilterParams = {
	session_ids: z.array(z.string()).optional().describe('Filter by specific session IDs'),
	created_after: z.number().int().optional().describe('Filter sessions created after this unix timestamp'),
	created_before: z.number().int().optional().describe('Filter sessions created before this unix timestamp'),
	updated_after: z.number().int().optional().describe('Filter sessions updated after this unix timestamp'),
	updated_before: z.number().int().optional().describe('Filter sessions updated before this unix timestamp'),
	tags: z.array(z.string()).optional().describe('Filter by tags'),
	playbook_id: z.string().optional().describe('Filter by playbook ID'),
	origins: z
		.array(z.enum(['webapp', 'cli', 'slack', 'teams', 'api', 'linear', 'jira', 'scheduled', 'other']))
		.optional()
		.describe('Filter by session origin'),
	schedule_id: z.string().optional().describe('Filter by schedule ID'),
	user_ids: z.array(z.string()).optional().describe('Filter by user IDs'),
	service_user_ids: z.array(z.string()).optional().describe('Filter by service user IDs'),
}

function buildSessionFilterQuery(
	params: Record<string, unknown>,
): Record<string, string | number | boolean | string[] | undefined | null> {
	const query: Record<string, string | number | boolean | string[] | undefined | null> = {}
	if (params.after) {
		query.after = params.after as string
	}
	if (params.first) {
		query.first = params.first as number
	}
	if (params.session_ids) {
		query.session_ids = params.session_ids as string[]
	}
	if (params.created_after) {
		query.created_after = params.created_after as number
	}
	if (params.created_before) {
		query.created_before = params.created_before as number
	}
	if (params.updated_after) {
		query.updated_after = params.updated_after as number
	}
	if (params.updated_before) {
		query.updated_before = params.updated_before as number
	}
	if (params.tags) {
		query.tags = params.tags as string[]
	}
	if (params.playbook_id) {
		query.playbook_id = params.playbook_id as string
	}
	if (params.origins) {
		query.origins = params.origins as string[]
	}
	if (params.schedule_id) {
		query.schedule_id = params.schedule_id as string
	}
	if (params.user_ids) {
		query.user_ids = params.user_ids as string[]
	}
	if (params.service_user_ids) {
		query.service_user_ids = params.service_user_ids as string[]
	}
	return query
}

// --- Tool registration ---

export function registerSessionTools(server: McpServer): void {
	// 1. create_session
	server.tool(
		'create_session',
		'Create a new Devin session via the v3 API. Sends a prompt to Devin and returns the session ID and URL.',
		{
			prompt: z.string().describe('The task/instructions for Devin'),
			title: z.string().optional().describe('Optional session title'),
			tags: z.array(z.string()).optional().describe('Optional tags for the session'),
			playbook_id: z.string().optional().describe('Optional playbook ID to use'),
			knowledge_ids: z
				.array(z.string())
				.optional()
				.describe('Knowledge IDs to attach. Omit to use all, pass empty array to use none'),
			secret_ids: z
				.array(z.string())
				.optional()
				.describe('Secret IDs to attach. Omit to use all, pass empty array to use none'),
			session_secrets: z
				.array(
					z.object({
						key: z.string().describe('Secret key name'),
						value: z.string().describe('Secret value'),
						sensitive: z.boolean().optional().describe('If true, value is redacted in logs'),
					}),
				)
				.optional()
				.describe('Temporary session-specific secrets (not persisted to org)'),
			max_acu_limit: z.number().int().positive().optional().describe('Max ACU (compute) limit'),
			structured_output_schema: z
				.record(z.string(), z.unknown())
				.optional()
				.describe('JSON Schema (Draft 7) for structured output validation. Max 64KB'),
			attachment_urls: z.array(z.string()).optional().describe('URLs of previously uploaded attachments to include'),
			repos: z.array(z.string()).optional().describe('Repository identifiers for the session'),
			advanced_mode: z
				.enum(['analyze', 'create', 'improve', 'batch', 'manage'])
				.optional()
				.describe('Advanced session mode'),
			bypass_approval: z.boolean().optional().describe('If true, bypass approval requirements'),
			create_as_user_id: z.string().optional().describe('Create session on behalf of this user ID'),
			child_playbook_id: z.string().optional().describe('Playbook ID for child sessions'),
			session_links: z.array(z.string()).optional().describe('Links to attach to the session'),
		},
		async (params) => {
			const body: Record<string, unknown> = { prompt: params.prompt }
			if (params.title !== undefined) {
				body.title = params.title
			}
			if (params.tags !== undefined) {
				body.tags = params.tags
			}
			if (params.playbook_id !== undefined) {
				body.playbook_id = params.playbook_id
			}
			if (params.knowledge_ids !== undefined) {
				body.knowledge_ids = params.knowledge_ids
			}
			if (params.secret_ids !== undefined) {
				body.secret_ids = params.secret_ids
			}
			if (params.session_secrets !== undefined) {
				body.session_secrets = params.session_secrets
			}
			if (params.max_acu_limit !== undefined) {
				body.max_acu_limit = params.max_acu_limit
			}
			if (params.structured_output_schema !== undefined) {
				body.structured_output_schema = params.structured_output_schema
			}
			if (params.attachment_urls !== undefined) {
				body.attachment_urls = params.attachment_urls
			}
			if (params.repos !== undefined) {
				body.repos = params.repos
			}
			if (params.advanced_mode !== undefined) {
				body.advanced_mode = params.advanced_mode
			}
			if (params.bypass_approval !== undefined) {
				body.bypass_approval = params.bypass_approval
			}
			if (params.create_as_user_id !== undefined) {
				body.create_as_user_id = params.create_as_user_id
			}
			if (params.child_playbook_id !== undefined) {
				body.child_playbook_id = params.child_playbook_id
			}
			if (params.session_links !== undefined) {
				body.session_links = params.session_links
			}

			const result = await v3Fetch('/sessions', { method: 'POST', body })
			return {
				content: [
					{
						type: 'text' as const,
						text: `Session created successfully!\nSession ID: ${result.session_id}\nURL: ${result.url}`,
					},
				],
			}
		},
	)

	// 2. list_sessions
	server.tool(
		'list_sessions',
		'List Devin sessions via the v3 API with filtering and pagination.',
		{
			...paginationParams,
			...sessionFilterParams,
		},
		async (params) => {
			const query = buildSessionFilterQuery(params)
			const data = await v3FetchArrayQuery('/sessions', query)
			const text = formatPaginatedResponse<SessionResponse>(data, formatSession, 'No sessions found.')
			return { content: [{ type: 'text' as const, text }] }
		},
	)

	// 3. get_session
	server.tool(
		'get_session',
		'Get full details of a specific Devin session via the v3 API.',
		{
			devin_id: z.string().describe('The session ID (e.g. devin-abc123...)'),
		},
		async ({ devin_id }) => {
			const result = await v3Fetch(`/sessions/${devin_id}`)
			return {
				content: [{ type: 'text' as const, text: formatSession(result) }],
			}
		},
	)

	// 4. delete_session
	server.tool(
		'delete_session',
		'Delete/terminate a Devin session via the v3 API. Optionally archive instead of hard-delete.',
		{
			devin_id: z.string().describe('The session ID to delete'),
			archive: z.boolean().optional().describe('If true, archive instead of hard-delete (default false)'),
		},
		async ({ devin_id, archive }) => {
			const query: Record<string, string | number | boolean | undefined | null> = {}
			if (archive !== undefined) {
				query.archive = archive
			}
			await v3Fetch(`/sessions/${devin_id}`, { method: 'DELETE', query })
			return {
				content: [
					{
						type: 'text' as const,
						text: archive ? `Session ${devin_id} archived.` : `Session ${devin_id} deleted.`,
					},
				],
			}
		},
	)

	// 5. send_message
	server.tool(
		'send_message',
		'Send a message to a Devin session via the v3 API.',
		{
			devin_id: z.string().describe('The session ID to message'),
			message: z.string().describe('The message to send to Devin'),
			message_as_user_id: z.string().optional().describe('Send as this user ID (impersonation)'),
		},
		async ({ devin_id, message, message_as_user_id }) => {
			const body: Record<string, unknown> = { message }
			if (message_as_user_id !== undefined) {
				body.message_as_user_id = message_as_user_id
			}
			await v3Fetch(`/sessions/${devin_id}/messages`, { method: 'POST', body })
			return {
				content: [{ type: 'text' as const, text: `Message sent to session ${devin_id}.` }],
			}
		},
	)

	// 6. get_messages
	server.tool(
		'get_messages',
		'Get messages from a Devin session via the v3 API. Returns paginated session messages.',
		{
			devin_id: z.string().describe('The session ID'),
			...paginationParams,
		},
		async ({ devin_id, after, first }) => {
			const query: Record<string, string | number | boolean | undefined | null> = {}
			if (after) {
				query.after = after
			}
			if (first) {
				query.first = first
			}
			const data = await v3Fetch(`/sessions/${devin_id}/messages`, { query })

			interface SessionMessage {
				event_id: string
				source: string
				message: string
				created_at: number
			}

			const text = formatPaginatedResponse<SessionMessage>(
				data,
				(msg) => `[${msg.source}] (${new Date(msg.created_at * 1000).toISOString()}) ${msg.message}`,
				'No messages found.',
			)
			return { content: [{ type: 'text' as const, text }] }
		},
	)

	// 7. add_session_tags
	server.tool(
		'add_session_tags',
		'Add tags to a Devin session via the v3 API. Appends to existing tags.',
		{
			devin_id: z.string().describe('The session ID'),
			tags: z.array(z.string()).max(50).describe('Tags to add (max 50 total)'),
		},
		async ({ devin_id, tags }) => {
			const result = await v3Fetch(`/sessions/${devin_id}/tags`, {
				method: 'POST',
				body: { tags } as Record<string, unknown>,
			})
			const updatedTags: string[] = result?.tags || tags
			return {
				content: [
					{
						type: 'text' as const,
						text: `Tags added to session ${devin_id}.\nCurrent tags: ${updatedTags.join(', ')}`,
					},
				],
			}
		},
	)

	// 8. replace_session_tags
	server.tool(
		'replace_session_tags',
		'Replace all tags on a Devin session via the v3 API.',
		{
			devin_id: z.string().describe('The session ID'),
			tags: z.array(z.string()).max(50).describe('New tags (replaces all existing, max 50)'),
		},
		async ({ devin_id, tags }) => {
			await v3Fetch(`/sessions/${devin_id}/tags`, {
				method: 'PUT',
				body: { tags } as Record<string, unknown>,
			})
			return {
				content: [
					{
						type: 'text' as const,
						text: `Tags replaced on session ${devin_id}.\nCurrent tags: ${tags.join(', ')}`,
					},
				],
			}
		},
	)

	// 9. get_session_tags
	server.tool(
		'get_session_tags',
		'Get tags for a Devin session via the v3 API.',
		{
			devin_id: z.string().describe('The session ID'),
		},
		async ({ devin_id }) => {
			const result = await v3Fetch(`/sessions/${devin_id}/tags`)
			const tags: string[] = result?.tags || []
			return {
				content: [
					{
						type: 'text' as const,
						text: tags.length ? `Tags for session ${devin_id}: ${tags.join(', ')}` : `Session ${devin_id} has no tags.`,
					},
				],
			}
		},
	)

	// 10. get_session_insights
	server.tool(
		'get_session_insights',
		'Get AI-generated insights for a specific Devin session via the v3 API.',
		{
			devin_id: z.string().describe('The session ID'),
		},
		async ({ devin_id }) => {
			const result = await v3Fetch(`/sessions/${devin_id}/insights`)
			const text = formatSessionInsights(result)
			return { content: [{ type: 'text' as const, text }] }
		},
	)

	// 11. list_session_insights
	server.tool(
		'list_session_insights',
		'List session insights across sessions via the v3 API with filtering and pagination.',
		{
			...paginationParams,
			...sessionFilterParams,
		},
		async (params) => {
			const query = buildSessionFilterQuery(params)
			const data = await v3FetchArrayQuery('/sessions/insights', query)

			const text = formatPaginatedResponse(data, formatSessionInsights, 'No session insights found.')
			return { content: [{ type: 'text' as const, text }] }
		},
	)

	// 12. generate_session_insights
	server.tool(
		'generate_session_insights',
		'Trigger AI insight generation for a Devin session via the v3 API. Returns immediately; insights are generated asynchronously.',
		{
			devin_id: z.string().describe('The session ID'),
		},
		async ({ devin_id }) => {
			const result = await v3Fetch(`/sessions/${devin_id}/insights/generate`, {
				method: 'POST',
				body: {} as Record<string, unknown>,
			})
			return {
				content: [
					{
						type: 'text' as const,
						text: `Insight generation triggered for session ${result?.session_id || devin_id}.\nStatus: ${result?.status || 'queued'}`,
					},
				],
			}
		},
	)

	// 13. get_session_attachments
	server.tool(
		'get_session_attachments',
		'Get attachments for a Devin session via the v3 API.',
		{
			devin_id: z.string().describe('The session ID'),
		},
		async ({ devin_id }) => {
			const result = await v3Fetch(`/sessions/${devin_id}/attachments`)
			const attachments: SessionAttachment[] = Array.isArray(result)
				? result
				: result?.items || result?.attachments || []

			if (!attachments.length) {
				return { content: [{ type: 'text' as const, text: `No attachments found for session ${devin_id}.` }] }
			}

			const text = attachments
				.map(
					(a) =>
						`${a.name} (${a.attachment_id})\n  URL: ${a.url}\n  Source: ${a.source}${a.content_type ? `\n  Type: ${a.content_type}` : ''}`,
				)
				.join('\n\n')
			return { content: [{ type: 'text' as const, text }] }
		},
	)

	// 14. archive_session
	server.tool(
		'archive_session',
		'Archive a Devin session via the v3 API.',
		{
			devin_id: z.string().describe('The session ID to archive'),
		},
		async ({ devin_id }) => {
			const result = await v3Fetch(`/sessions/${devin_id}/archive`, {
				method: 'POST',
				body: {} as Record<string, unknown>,
			})
			return {
				content: [{ type: 'text' as const, text: formatSession(result) }],
			}
		},
	)
}

// --- Insight formatting ---

interface SessionInsights extends SessionResponse {
	num_user_messages?: number
	num_devin_messages?: number
	session_size?: string
	analysis?: string | null
}

interface SessionAttachment {
	attachment_id: string
	name: string
	url: string
	source: string
	content_type?: string
}

function formatSessionInsights(s: SessionInsights): string {
	const parts = [formatSession(s)]
	if (s.num_user_messages !== undefined) {
		parts.push(`User messages: ${s.num_user_messages}`)
	}
	if (s.num_devin_messages !== undefined) {
		parts.push(`Devin messages: ${s.num_devin_messages}`)
	}
	if (s.session_size) {
		parts.push(`Session size: ${s.session_size}`)
	}
	if (s.analysis) {
		parts.push(`Analysis:\n${s.analysis}`)
	}
	return parts.join('\n')
}
