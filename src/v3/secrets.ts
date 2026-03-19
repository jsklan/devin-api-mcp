import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { formatPaginatedResponse, paginationParams, v3Fetch } from './shared.js'

interface Secret {
	secret_id: string
	key: string | null
	note: string | null
	is_sensitive: boolean
	created_by: string
	created_at: number
	secret_type: string
	access_type: string
}

function formatSecret(s: Secret): string {
	const parts = [
		`Secret: ${s.secret_id}`,
		`Key: ${s.key || '(unnamed)'}`,
		`Type: ${s.secret_type}`,
		`Sensitive: ${s.is_sensitive}`,
		`Access: ${s.access_type}`,
		`Created by: ${s.created_by}`,
	]
	if (s.note) {
		parts.push(`Note: ${s.note}`)
	}
	return parts.join('\n')
}

export function registerSecretTools(server: McpServer): void {
	server.tool(
		'list_secrets',
		'List secret metadata in the organization. Secret values are never returned.',
		{
			...paginationParams,
		},
		async (params) => {
			const data = await v3Fetch('/secrets', {
				query: { after: params.after, first: params.first },
			})
			const text = formatPaginatedResponse<Secret>(data, formatSecret, 'No secrets found.')
			return { content: [{ type: 'text' as const, text }] }
		},
	)

	server.tool(
		'create_secret',
		'Create a new secret in the organization. The value is encrypted at rest and never returned.',
		{
			type: z.enum(['cookie', 'key-value', 'totp']).describe('Secret type'),
			key: z.string().describe('Secret name (must be unique in org)'),
			value: z.string().describe('Secret value (will be encrypted)'),
			is_sensitive: z.boolean().optional().describe('If true, value is redacted in logs (default: true)'),
			note: z.string().nullable().optional().describe("Optional description of the secret's purpose"),
		},
		async (params) => {
			const body: Record<string, unknown> = {
				type: params.type,
				key: params.key,
				value: params.value,
			}
			if (params.is_sensitive !== undefined) {
				body.is_sensitive = params.is_sensitive
			}
			if (params.note !== undefined) {
				body.note = params.note
			}

			const result: Secret = await v3Fetch('/secrets', {
				method: 'POST',
				body,
			})
			return {
				content: [
					{
						type: 'text' as const,
						text: `Secret created: ${result.key || '(unnamed)'} (${result.secret_id})`,
					},
				],
			}
		},
	)

	server.tool(
		'delete_secret',
		'Permanently delete a secret from the organization. This cannot be undone.',
		{
			secret_id: z.string().describe('The secret ID to delete'),
		},
		async ({ secret_id }) => {
			await v3Fetch(`/secrets/${secret_id}`, { method: 'DELETE' })
			return {
				content: [
					{
						type: 'text' as const,
						text: `Secret ${secret_id} deleted.`,
					},
				],
			}
		},
	)
}
