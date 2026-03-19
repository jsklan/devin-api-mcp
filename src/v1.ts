#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_BASE = 'https://api.devin.ai'

function getApiKey(): string {
	const key = process.env.DEVIN_PERSONAL_API_KEY || process.env.DEVIN_API_KEY
	if (!key) {
		throw new Error(
			'DEVIN_PERSONAL_API_KEY environment variable is required. ' + 'Get your key from your Devin account settings.',
		)
	}
	return key
}

interface FetchOptions {
	method?: string
	body?: Record<string, unknown>
	query?: Record<string, string | number | boolean | undefined | null>
}

async function devinFetch(path: string, options: FetchOptions = {}): Promise<any> {
	const { method = 'GET', body, query } = options
	let url = `${API_BASE}${path}`
	if (query) {
		const params = new URLSearchParams()
		for (const [k, v] of Object.entries(query)) {
			if (v !== undefined && v !== null && v !== '') {
				params.append(k, String(v))
			}
		}
		const qs = params.toString()
		if (qs) {
			url += `?${qs}`
		}
	}

	const headers: Record<string, string> = { Authorization: `Bearer ${getApiKey()}` }
	if (body) {
		headers['Content-Type'] = 'application/json'
	}

	const res = await fetch(url, {
		method,
		headers,
		...(body ? { body: JSON.stringify(body) } : {}),
	})

	if (!res.ok) {
		const text = await res.text()
		throw new Error(`Devin API ${method} ${path} returned ${res.status}: ${text}`)
	}

	if (res.status === 204) {
		return null
	}
	return res.json()
}

async function devinFetchFormData(path: string, formData: FormData): Promise<any> {
	const res = await fetch(`${API_BASE}${path}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${getApiKey()}` },
		body: formData,
	})

	if (!res.ok) {
		const text = await res.text()
		throw new Error(`Devin API POST ${path} returned ${res.status}: ${text}`)
	}

	// The attachments endpoint may return a plain string URL or JSON
	const text = await res.text()
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

interface Session {
	session_id: string
	status_enum?: string
	status?: string
	title?: string
	created_at: string
	requesting_user_email?: string
	pull_request?: { url?: string }
	url?: string
	tags?: string[]
}

function formatSession(s: Session): string {
	const parts = [
		`Session: ${s.session_id}`,
		`Status: ${s.status_enum || s.status}`,
		`Title: ${s.title || '(untitled)'}`,
		`Created: ${s.created_at}`,
		`User: ${s.requesting_user_email || 'unknown'}`,
	]
	if (s.pull_request?.url) {
		parts.push(`PR: ${s.pull_request.url}`)
	}
	if (s.url) {
		parts.push(`URL: ${s.url}`)
	}
	if (s.tags?.length) {
		parts.push(`Tags: ${s.tags.join(', ')}`)
	}
	return parts.join('\n')
}

const server = new McpServer(
	{
		name: 'devin-api',
		version: '0.2.0',
	},
	{
		instructions:
			'Use this server for managing Devin sessions (create, list, message, terminate, tag), ' +
			'knowledge (list, create, update, delete), ' +
			'playbooks (list, get, create, update, delete), ' +
			'secrets (list, create, delete), ' +
			'and attachments (upload) via the Devin REST API. ' +
			"Do NOT use this server for documentation queries or asking questions about repositories — those use the separate DeepWiki 'devin' MCP server.",
	},
)

// --- Session tools ---

server.tool(
	'create_session',
	'Create a new Devin session via the REST API. Sends a prompt to Devin and returns the session ID and URL.',
	{
		prompt: z.string().describe('The task/instructions for Devin'),
		title: z.string().optional().describe('Optional session title'),
		playbook_id: z.string().optional().describe('Optional playbook ID to use'),
		snapshot_id: z.string().optional().describe('Optional snapshot ID'),
		tags: z.array(z.string()).optional().describe('Optional tags for the session'),
		unlisted: z.boolean().optional().describe("If true, session won't appear in dashboard"),
		max_acu_limit: z.number().int().positive().optional().describe('Optional max ACU (compute) limit'),
		idempotent: z
			.boolean()
			.optional()
			.describe('If true, reuse an existing session with the same prompt instead of creating a new one'),
		knowledge_ids: z
			.array(z.string())
			.optional()
			.describe('List of knowledge IDs to use. If omitted, uses all knowledge. Pass empty array to use none'),
		secret_ids: z
			.array(z.string())
			.optional()
			.describe('List of secret IDs to use. If omitted, uses all secrets. Pass empty array to use none'),
		session_secrets: z
			.array(
				z.object({
					key: z.string().describe('Secret key name'),
					value: z.string().describe('Secret value'),
				}),
			)
			.optional()
			.describe('Temporary session-specific secrets (not persisted to org)'),
		structured_output_schema: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('JSON Schema (Draft 7) for structured output validation. Max 64KB'),
	},
	async (params) => {
		const body: Record<string, unknown> = { prompt: params.prompt }
		if (params.title) {
			body.title = params.title
		}
		if (params.playbook_id) {
			body.playbook_id = params.playbook_id
		}
		if (params.snapshot_id) {
			body.snapshot_id = params.snapshot_id
		}
		if (params.tags) {
			body.tags = params.tags
		}
		if (params.unlisted) {
			body.unlisted = params.unlisted
		}
		if (params.max_acu_limit) {
			body.max_acu_limit = params.max_acu_limit
		}
		if (params.idempotent !== undefined) {
			body.idempotent = params.idempotent
		}
		if (params.knowledge_ids) {
			body.knowledge_ids = params.knowledge_ids
		}
		if (params.secret_ids) {
			body.secret_ids = params.secret_ids
		}
		if (params.session_secrets) {
			body.session_secrets = params.session_secrets
		}
		if (params.structured_output_schema) {
			body.structured_output_schema = params.structured_output_schema
		}

		const result = await devinFetch('/v1/sessions', { method: 'POST', body })
		return {
			content: [
				{
					type: 'text' as const,
					text: [
						`Session created successfully!`,
						`Session ID: ${result.session_id}`,
						`URL: ${result.url}`,
						result.is_new_session === false ? '(Reused existing idempotent session)' : '',
					]
						.filter(Boolean)
						.join('\n'),
				},
			],
		}
	},
)

server.tool(
	'list_sessions',
	'List Devin sessions via the REST API. Returns recent sessions with their status, title, and metadata.',
	{
		limit: z.number().int().optional().describe('Max sessions to return (default: 20)'),
		offset: z.number().int().optional().describe('Pagination offset'),
		tags: z.array(z.string()).optional().describe('Filter by tags'),
		user_email: z.string().optional().describe('Filter by requesting user email'),
	},
	async (params) => {
		const query: Record<string, string> = { limit: String(params.limit || 20) }
		if (params.offset) {
			query.offset = String(params.offset)
		}
		if (params.user_email) {
			query.user_email = params.user_email
		}
		// tags need to be passed as repeated query params
		let url = '/v1/sessions'
		const baseQuery = new URLSearchParams()
		baseQuery.append('limit', query.limit)
		if (query.offset) {
			baseQuery.append('offset', query.offset)
		}
		if (query.user_email) {
			baseQuery.append('user_email', query.user_email)
		}
		if (params.tags) {
			for (const tag of params.tags) {
				baseQuery.append('tags', tag)
			}
		}
		const qs = baseQuery.toString()
		if (qs) {
			url += `?${qs}`
		}

		const res = await fetch(`${API_BASE}${url}`, {
			headers: { Authorization: `Bearer ${getApiKey()}` },
		})
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Devin API GET ${url} returned ${res.status}: ${text}`)
		}
		const data = await res.json()
		const sessions: Session[] = data.sessions || data

		if (!sessions.length) {
			return { content: [{ type: 'text' as const, text: 'No sessions found.' }] }
		}

		const text = sessions.map(formatSession).join('\n\n---\n\n')
		return { content: [{ type: 'text' as const, text }] }
	},
)

server.tool(
	'get_session',
	'Get details of a specific Devin session via the REST API, including its messages and status.',
	{
		session_id: z.string().describe('The session ID (e.g. devin-abc123...)'),
	},
	async ({ session_id }) => {
		const result = await devinFetch(`/v1/sessions/${session_id}`)

		const parts = [formatSession(result)]

		if (result.structured_output) {
			parts.push(`\nStructured Output:\n${JSON.stringify(result.structured_output, null, 2)}`)
		}

		// Include recent messages if available
		if (result.messages?.length) {
			parts.push('\n--- Recent Messages ---')
			for (const msg of result.messages.slice(-10)) {
				const role = msg.role || msg.type || 'unknown'
				const text = msg.message || msg.text || JSON.stringify(msg)
				parts.push(`[${role}]: ${text}`)
			}
		}

		return { content: [{ type: 'text' as const, text: parts.join('\n') }] }
	},
)

server.tool(
	'send_message',
	'Send a follow-up message to a running Devin session via the REST API.',
	{
		session_id: z.string().describe('The session ID to message'),
		message: z.string().describe('The message to send to Devin'),
	},
	async ({ session_id, message }) => {
		await devinFetch(`/v1/sessions/${session_id}/message`, {
			method: 'POST',
			body: { message },
		})
		return {
			content: [{ type: 'text' as const, text: `Message sent to session ${session_id}.` }],
		}
	},
)

server.tool(
	'terminate_session',
	'Terminate/stop a running Devin session via the REST API.',
	{
		session_id: z.string().describe('The session ID to terminate'),
	},
	async ({ session_id }) => {
		const result = await devinFetch(`/v1/sessions/${session_id}`, { method: 'DELETE' })
		return {
			content: [
				{
					type: 'text' as const,
					text: result?.detail || `Session ${session_id} terminated.`,
				},
			],
		}
	},
)

server.tool(
	'update_session_tags',
	'Update the tags on a Devin session via the REST API. Replaces all existing tags.',
	{
		session_id: z.string().describe('The session ID'),
		tags: z.array(z.string()).max(50).describe('New tags for the session (replaces existing tags, max 50)'),
	},
	async ({ session_id, tags }) => {
		const result = await devinFetch(`/v1/sessions/${session_id}/tags`, {
			method: 'PUT',
			body: { tags },
		})
		return {
			content: [{ type: 'text' as const, text: result?.detail || `Tags updated on session ${session_id}.` }],
		}
	},
)

// --- Knowledge tools ---

server.tool(
	'list_knowledge',
	'List all knowledge entries and folders in the organization via the REST API.',
	{},
	async () => {
		const data = await devinFetch('/v1/knowledge')
		const parts: string[] = []

		if (data.folders?.length) {
			parts.push('--- Folders ---')
			for (const f of data.folders) {
				parts.push(`${f.name} (${f.id}): ${f.description || '(no description)'}`)
			}
		}

		if (data.knowledge?.length) {
			parts.push('--- Knowledge ---')
			for (const k of data.knowledge) {
				parts.push(
					[
						`${k.name} (${k.id})`,
						`  Trigger: ${k.trigger_description}`,
						k.pinned_repo ? `  Repo: ${k.pinned_repo}` : '',
						k.parent_folder_id ? `  Folder: ${k.parent_folder_id}` : '',
					]
						.filter(Boolean)
						.join('\n'),
				)
			}
		}

		if (!parts.length) {
			return { content: [{ type: 'text' as const, text: 'No knowledge entries found.' }] }
		}

		return { content: [{ type: 'text' as const, text: parts.join('\n\n') }] }
	},
)

server.tool(
	'create_knowledge',
	'Create a new knowledge entry in the organization via the REST API. Knowledge entries teach Devin domain-specific information.',
	{
		name: z.string().describe('Name for the knowledge entry'),
		body: z.string().describe('The knowledge content (markdown supported)'),
		trigger_description: z.string().describe('Description of when Devin should use this knowledge'),
		macro: z.string().optional().describe('Optional macro identifier'),
		parent_folder_id: z.string().optional().describe('Optional folder ID to organize this entry under'),
		pinned_repo: z.string().optional().describe('Optional repository to associate with this knowledge'),
	},
	async (params) => {
		const result = await devinFetch('/v1/knowledge', {
			method: 'POST',
			body: params as unknown as Record<string, unknown>,
		})
		return {
			content: [
				{
					type: 'text' as const,
					text: `Knowledge created: ${result.name} (${result.id})`,
				},
			],
		}
	},
)

server.tool(
	'update_knowledge',
	'Update an existing knowledge entry via the REST API.',
	{
		note_id: z.string().describe('The knowledge entry ID to update'),
		name: z.string().describe('Updated name'),
		body: z.string().describe('Updated content'),
		trigger_description: z.string().describe('Updated trigger description'),
		macro: z.string().nullable().optional().describe('Updated macro (null to clear)'),
		parent_folder_id: z.string().nullable().optional().describe('Updated folder ID (null to clear)'),
		pinned_repo: z.string().nullable().optional().describe('Updated pinned repo (null to clear)'),
	},
	async ({ note_id, ...fields }) => {
		const result = await devinFetch(`/v1/knowledge/${note_id}`, {
			method: 'PUT',
			body: fields as unknown as Record<string, unknown>,
		})
		return {
			content: [
				{
					type: 'text' as const,
					text: `Knowledge updated: ${result.name} (${result.id})`,
				},
			],
		}
	},
)

server.tool(
	'delete_knowledge',
	'Delete a knowledge entry from the organization via the REST API. This is permanent.',
	{
		note_id: z.string().describe('The knowledge entry ID to delete'),
	},
	async ({ note_id }) => {
		await devinFetch(`/v1/knowledge/${note_id}`, { method: 'DELETE' })
		return {
			content: [{ type: 'text' as const, text: `Knowledge entry ${note_id} deleted.` }],
		}
	},
)

// --- Playbook tools ---

server.tool(
	'list_playbooks',
	'List available Devin playbooks via the REST API (titles and IDs only). Use get_playbook to see full details.',
	{},
	async () => {
		const playbooks = await devinFetch('/v1/playbooks')
		if (!playbooks.length) {
			return { content: [{ type: 'text' as const, text: 'No playbooks found.' }] }
		}
		const text = playbooks.map((p: any) => `${p.title} (${p.playbook_id})`).join('\n')
		return { content: [{ type: 'text' as const, text }] }
	},
)

server.tool(
	'get_playbook',
	'Get full details of a specific Devin playbook via the REST API.',
	{
		playbook_id: z.string().describe('The playbook ID (e.g. playbook-abc123...)'),
	},
	async ({ playbook_id }) => {
		const playbook = await devinFetch(`/v1/playbooks/${playbook_id}`)
		const text = [`Title: ${playbook.title}`, `ID: ${playbook.playbook_id}`, `\n${playbook.body}`].join('\n')
		return { content: [{ type: 'text' as const, text }] }
	},
)

server.tool(
	'create_playbook',
	'Create a new team playbook via the REST API.',
	{
		title: z.string().min(1).describe('Playbook title'),
		body: z.string().min(1).describe('Playbook content/instructions'),
		macro: z.string().optional().describe('Optional macro identifier'),
	},
	async (params) => {
		const result = await devinFetch('/v1/playbooks', {
			method: 'POST',
			body: params as unknown as Record<string, unknown>,
		})
		return {
			content: [
				{
					type: 'text' as const,
					text: `Playbook created: ${result.title} (${result.playbook_id})`,
				},
			],
		}
	},
)

server.tool(
	'update_playbook',
	'Update an existing team playbook via the REST API.',
	{
		playbook_id: z.string().describe('The playbook ID to update'),
		title: z.string().min(1).describe('Updated title'),
		body: z.string().min(1).describe('Updated content/instructions'),
		macro: z.string().nullable().optional().describe('Updated macro (null to clear)'),
	},
	async ({ playbook_id, ...fields }) => {
		const result = await devinFetch(`/v1/playbooks/${playbook_id}`, {
			method: 'PUT',
			body: fields as unknown as Record<string, unknown>,
		})
		return {
			content: [
				{
					type: 'text' as const,
					text: result?.status || `Playbook ${playbook_id} updated.`,
				},
			],
		}
	},
)

server.tool(
	'delete_playbook',
	'Delete a team playbook via the REST API. Requires ManageOrgPlaybooks permission.',
	{
		playbook_id: z.string().describe('The playbook ID to delete'),
	},
	async ({ playbook_id }) => {
		const result = await devinFetch(`/v1/playbooks/${playbook_id}`, { method: 'DELETE' })
		return {
			content: [
				{
					type: 'text' as const,
					text: result?.status || `Playbook ${playbook_id} deleted.`,
				},
			],
		}
	},
)

// --- Secrets tools ---

server.tool(
	'list_secrets',
	'List metadata for all secrets in the organization via the REST API. Secret values are never returned.',
	{},
	async () => {
		const data = await devinFetch('/v1/secrets')
		const secrets = Array.isArray(data) ? data : data.secrets || []
		if (!secrets.length) {
			return { content: [{ type: 'text' as const, text: 'No secrets found.' }] }
		}
		const text = secrets
			.map(
				(s: any) =>
					`${s.key || '(unnamed)'} (${s.id}) — type: ${s.type}${s.created_at ? `, created: ${s.created_at}` : ''}`,
			)
			.join('\n')
		return { content: [{ type: 'text' as const, text }] }
	},
)

server.tool(
	'create_secret',
	'Create a new secret in the organization via the REST API. The secret value is encrypted at rest.',
	{
		type: z.enum(['cookie', 'key-value', 'totp']).describe('Secret type'),
		key: z.string().describe('Secret name (must be unique in org)'),
		value: z.string().describe('Secret value (will be encrypted)'),
		sensitive: z.boolean().describe('If true, value is redacted in logs'),
		note: z.string().optional().describe("Optional description of the secret's purpose"),
	},
	async (params) => {
		const result = await devinFetch('/v1/secrets', {
			method: 'POST',
			body: params as unknown as Record<string, unknown>,
		})
		return {
			content: [
				{
					type: 'text' as const,
					text: `Secret created with ID: ${result.id}`,
				},
			],
		}
	},
)

server.tool(
	'delete_secret',
	'Permanently delete a secret from the organization via the REST API. This cannot be undone.',
	{
		secret_id: z.string().describe('The secret ID to delete'),
	},
	async ({ secret_id }) => {
		const result = await devinFetch(`/v1/secrets/${secret_id}`, { method: 'DELETE' })
		return {
			content: [
				{
					type: 'text' as const,
					text: result?.message || `Secret ${secret_id} deleted.`,
				},
			],
		}
	},
)

// --- Attachment tools ---

server.tool(
	'upload_attachment',
	'Upload a file attachment for use in Devin sessions via the REST API. Returns a URL to reference in session prompts using ATTACHMENT:"<url>" format.',
	{
		file_path: z.string().describe('Absolute path to the file to upload'),
	},
	async ({ file_path }) => {
		const fileBuffer = await readFile(file_path)
		const fileName = basename(file_path)
		const blob = new Blob([fileBuffer])
		const formData = new FormData()
		formData.append('file', blob, fileName)

		const url = await devinFetchFormData('/v1/attachments', formData)
		return {
			content: [
				{
					type: 'text' as const,
					text: [
						`File uploaded: ${fileName}`,
						`URL: ${url}`,
						``,
						`To use in a session prompt, add this on its own line:`,
						`ATTACHMENT:"${url}"`,
					].join('\n'),
				},
			],
		}
	},
)

// --- Start server ---

const transport = new StdioServerTransport()
await server.connect(transport)
