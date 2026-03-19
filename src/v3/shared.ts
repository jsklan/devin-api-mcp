import { z } from 'zod'

const API_BASE = 'https://api.devin.ai'

let cachedOrgId: string | null = null

function getServiceKey(): string {
	const key = process.env.DEVIN_SERVICE_API_KEY
	if (!key) {
		throw new Error(
			'DEVIN_SERVICE_API_KEY environment variable is required. ' +
				'Create a service user in your Devin org settings to get a cog_ prefixed key.',
		)
	}
	return key
}

export async function initOrgContext(): Promise<string> {
	if (cachedOrgId) {
		return cachedOrgId
	}

	const res = await fetch(`${API_BASE}/v3/self`, {
		headers: { Authorization: `Bearer ${getServiceKey()}` },
	})

	if (!res.ok) {
		const text = await res.text()
		throw new Error(
			`Failed to discover org_id from /v3/self (${res.status}): ${text}. ` +
				'Ensure DEVIN_SERVICE_API_KEY is a valid service user key (cog_ prefix).',
		)
	}

	const data: any = await res.json()
	cachedOrgId = data.org_id
	if (!cachedOrgId) {
		throw new Error('No org_id returned from /v3/self. Is this a valid org-scoped service user?')
	}
	return cachedOrgId
}

export function getOrgId(): string {
	if (!cachedOrgId) {
		throw new Error('Org context not initialized. Call initOrgContext() first.')
	}
	return cachedOrgId
}

interface FetchOptions {
	method?: string
	body?: Record<string, unknown>
	query?: Record<string, string | number | boolean | undefined | null>
}

export async function v3Fetch(path: string, options: FetchOptions = {}): Promise<any> {
	const { method = 'GET', body, query } = options
	const orgId = getOrgId()
	let url = `${API_BASE}/v3/organizations/${orgId}${path}`

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

	const headers: Record<string, string> = {
		Authorization: `Bearer ${getServiceKey()}`,
	}
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
		throw new Error(`Devin API v3 ${method} ${path} returned ${res.status}: ${text}`)
	}

	if (res.status === 204) {
		return null
	}
	return res.json()
}

export async function v3FetchFormData(path: string, formData: FormData): Promise<any> {
	const orgId = getOrgId()
	const res = await fetch(`${API_BASE}/v3/organizations/${orgId}${path}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${getServiceKey()}` },
		body: formData,
	})

	if (!res.ok) {
		const text = await res.text()
		throw new Error(`Devin API v3 POST ${path} returned ${res.status}: ${text}`)
	}

	const text = await res.text()
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

export async function v3FetchArrayQuery(
	path: string,
	query: Record<string, string | number | boolean | string[] | undefined | null>,
): Promise<any> {
	const orgId = getOrgId()
	const params = new URLSearchParams()
	for (const [k, v] of Object.entries(query)) {
		if (v === undefined || v === null || v === '') {
			continue
		}
		if (Array.isArray(v)) {
			for (const item of v) {
				params.append(k, item)
			}
		} else {
			params.append(k, String(v))
		}
	}
	const qs = params.toString()
	const url = `${API_BASE}/v3/organizations/${orgId}${path}${qs ? `?${qs}` : ''}`

	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${getServiceKey()}` },
	})

	if (!res.ok) {
		const text = await res.text()
		throw new Error(`Devin API v3 GET ${path} returned ${res.status}: ${text}`)
	}

	return res.json()
}

// Common pagination schema fields for use in tool definitions
export const paginationParams = {
	after: z.string().optional().describe("Pagination cursor from a previous response's end_cursor"),
	first: z.number().int().min(1).max(200).optional().describe('Number of items per page (default 100, max 200)'),
}

// Format a paginated response into readable text
export function formatPaginatedResponse<T>(
	data: { items: T[]; end_cursor: string | null; has_next_page: boolean; total: number | null },
	formatItem: (item: T) => string,
	emptyMessage: string,
): string {
	if (!data.items?.length) {
		return emptyMessage
	}

	const lines = data.items.map(formatItem)
	const meta: string[] = []
	if (data.total !== null && data.total !== undefined) {
		meta.push(`Total: ${data.total}`)
	}
	if (data.has_next_page && data.end_cursor) {
		meta.push(`Next cursor: ${data.end_cursor}`)
	}

	if (meta.length) {
		lines.push(`\n---\n${meta.join(' | ')}`)
	}
	return lines.join('\n\n')
}
