#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerAttachmentTools } from './v3/attachments.js'
import { registerKnowledgeTools } from './v3/knowledge.js'
import { registerPlaybookTools } from './v3/playbooks.js'
import { registerScheduleTools } from './v3/schedules.js'
import { registerSecretTools } from './v3/secrets.js'
import { registerSessionTools } from './v3/sessions.js'
import { initOrgContext } from './v3/shared.js'

const server = new McpServer(
	{
		name: 'devin-api-v3',
		version: '0.4.0',
	},
	{
		instructions:
			'Use this server for managing Devin resources via the v3 Organization API. ' +
			'Covers sessions (create, list, get, delete, message, tags, insights, archive), ' +
			'knowledge notes (CRUD), playbooks (CRUD), secrets (list, create, delete), ' +
			'schedules (CRUD), and attachments (upload, get). ' +
			'All operations are scoped to the organization associated with the DEVIN_SERVICE_API_KEY. ' +
			"Do NOT use this server for documentation queries — those use the DeepWiki 'devin' MCP server. " +
			"For legacy v1 API operations, use the 'devin-api-v1' server instead.",
	},
)

async function main() {
	const orgId = await initOrgContext()
	console.error(`[devin-api-v3] Initialized for org: ${orgId}`)

	registerSessionTools(server)
	registerKnowledgeTools(server)
	registerPlaybookTools(server)
	registerSecretTools(server)
	registerScheduleTools(server)
	registerAttachmentTools(server)

	const transport = new StdioServerTransport()
	await server.connect(transport)
}

main().catch((err) => {
	console.error(`[devin-api-v3] Failed to start: ${err.message}`)
	process.exit(1)
})
