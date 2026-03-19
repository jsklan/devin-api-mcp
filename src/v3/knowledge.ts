import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { formatPaginatedResponse, paginationParams, v3Fetch } from './shared.js'

interface KnowledgeNote {
	note_id: string
	folder_id: string | null
	name: string
	body: string
	trigger: string
	is_enabled: boolean
	created_at: number
	updated_at: number
	access_type: string
	org_id: string | null
	pinned_repo: string | null
}

function formatKnowledgeNote(k: KnowledgeNote): string {
	const parts = [`Note: ${k.note_id}`, `Name: ${k.name}`, `Trigger: ${k.trigger}`, `Enabled: ${k.is_enabled}`]
	if (k.pinned_repo) {
		parts.push(`Repo: ${k.pinned_repo}`)
	}
	if (k.folder_id) {
		parts.push(`Folder: ${k.folder_id}`)
	}
	return parts.join('\n')
}

export function registerKnowledgeTools(server: McpServer): void {
	server.tool(
		'list_knowledge',
		'List knowledge notes in the organization. Returns note IDs, names, triggers, and metadata.',
		{
			...paginationParams,
		},
		async (params) => {
			const data = await v3Fetch('/knowledge/notes', {
				query: { after: params.after, first: params.first },
			})
			const text = formatPaginatedResponse<KnowledgeNote>(data, formatKnowledgeNote, 'No knowledge notes found.')
			return { content: [{ type: 'text' as const, text }] }
		},
	)

	server.tool(
		'create_knowledge',
		'Create a new knowledge note. Knowledge teaches Devin domain-specific information triggered by context.',
		{
			name: z.string().describe('Name for the knowledge note'),
			body: z.string().describe('The knowledge content (markdown supported)'),
			trigger: z.string().describe('Description of when Devin should use this knowledge'),
			pinned_repo: z
				.string()
				.nullable()
				.optional()
				.describe('Optional repository to pin this knowledge to (null to clear)'),
		},
		async (params) => {
			const body: Record<string, unknown> = {
				name: params.name,
				body: params.body,
				trigger: params.trigger,
			}
			if (params.pinned_repo !== undefined) {
				body.pinned_repo = params.pinned_repo
			}

			const result: KnowledgeNote = await v3Fetch('/knowledge/notes', {
				method: 'POST',
				body,
			})
			return {
				content: [
					{
						type: 'text' as const,
						text: `Knowledge created: ${result.name} (${result.note_id})`,
					},
				],
			}
		},
	)

	server.tool(
		'update_knowledge',
		'Update an existing knowledge note by ID.',
		{
			note_id: z.string().describe('The knowledge note ID to update'),
			name: z.string().describe('Updated name'),
			body: z.string().describe('Updated content'),
			trigger: z.string().describe('Updated trigger description'),
			pinned_repo: z.string().nullable().optional().describe('Updated pinned repo (null to clear)'),
		},
		async ({ note_id, ...fields }) => {
			const body: Record<string, unknown> = {
				name: fields.name,
				body: fields.body,
				trigger: fields.trigger,
			}
			if (fields.pinned_repo !== undefined) {
				body.pinned_repo = fields.pinned_repo
			}

			const result: KnowledgeNote = await v3Fetch(`/knowledge/notes/${note_id}`, {
				method: 'PUT',
				body,
			})
			return {
				content: [
					{
						type: 'text' as const,
						text: `Knowledge updated: ${result.name} (${result.note_id})`,
					},
				],
			}
		},
	)

	server.tool(
		'delete_knowledge',
		'Delete a knowledge note from the organization. This is permanent.',
		{
			note_id: z.string().describe('The knowledge note ID to delete'),
		},
		async ({ note_id }) => {
			const result: KnowledgeNote = await v3Fetch(`/knowledge/notes/${note_id}`, {
				method: 'DELETE',
			})
			return {
				content: [
					{
						type: 'text' as const,
						text: `Knowledge deleted: ${result.name} (${result.note_id})`,
					},
				],
			}
		},
	)
}
