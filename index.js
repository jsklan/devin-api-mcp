#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = "https://api.devin.ai";

function getApiKey() {
  const key = process.env.DEVIN_API_KEY;
  if (!key) {
    throw new Error(
      "DEVIN_API_KEY environment variable is required. " +
        "Get your key from your Devin account settings."
    );
  }
  return key;
}

async function devinFetch(path, options = {}) {
  const { method = "GET", body, query } = options;
  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        params.append(k, String(v));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { Authorization: `Bearer ${getApiKey()}` };
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Devin API ${method} ${path} returned ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function formatSession(s) {
  const parts = [
    `Session: ${s.session_id}`,
    `Status: ${s.status_enum || s.status}`,
    `Title: ${s.title || "(untitled)"}`,
    `Created: ${s.created_at}`,
    `User: ${s.requesting_user_email || "unknown"}`,
  ];
  if (s.pull_request?.url) parts.push(`PR: ${s.pull_request.url}`);
  if (s.url) parts.push(`URL: ${s.url}`);
  if (s.tags?.length) parts.push(`Tags: ${s.tags.join(", ")}`);
  return parts.join("\n");
}

const server = new McpServer({
  name: "devin-api",
  version: "0.1.0",
  instructions:
    "Use this server for managing Devin sessions (create, list, message, terminate) and playbooks via the Devin REST API. " +
    "Do NOT use this server for documentation queries or asking questions about repositories — those use the separate DeepWiki 'devin' MCP server.",
});

// --- Session tools ---

server.tool(
  "create_session",
  "Create a new Devin session via the REST API. Sends a prompt to Devin and returns the session ID and URL.",
  {
    prompt: z.string().describe("The task/instructions for Devin"),
    title: z.string().optional().describe("Optional session title"),
    playbook_id: z.string().optional().describe("Optional playbook ID to use"),
    snapshot_id: z.string().optional().describe("Optional snapshot ID"),
    tags: z.array(z.string()).optional().describe("Optional tags for the session"),
    unlisted: z.boolean().optional().describe("If true, session won't appear in dashboard"),
    max_acu_limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional max ACU (compute) limit"),
  },
  async (params) => {
    const body = { prompt: params.prompt };
    if (params.title) body.title = params.title;
    if (params.playbook_id) body.playbook_id = params.playbook_id;
    if (params.snapshot_id) body.snapshot_id = params.snapshot_id;
    if (params.tags) body.tags = params.tags;
    if (params.unlisted) body.unlisted = params.unlisted;
    if (params.max_acu_limit) body.max_acu_limit = params.max_acu_limit;

    const result = await devinFetch("/v1/sessions", { method: "POST", body });
    return {
      content: [
        {
          type: "text",
          text: [
            `Session created successfully!`,
            `Session ID: ${result.session_id}`,
            `URL: ${result.url}`,
            result.is_new_session === false ? "(Reused existing idempotent session)" : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  }
);

server.tool(
  "list_sessions",
  "List Devin sessions via the REST API. Returns recent sessions with their status, title, and metadata.",
  {
    limit: z.number().int().optional().describe("Max sessions to return (default: 20)"),
    offset: z.number().int().optional().describe("Pagination offset"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    user_email: z.string().optional().describe("Filter by requesting user email"),
  },
  async (params) => {
    const query = { limit: params.limit || 20 };
    if (params.offset) query.offset = params.offset;
    if (params.user_email) query.user_email = params.user_email;
    // tags need to be passed as repeated query params
    let url = "/v1/sessions";
    const baseQuery = new URLSearchParams();
    baseQuery.append("limit", String(query.limit));
    if (query.offset) baseQuery.append("offset", String(query.offset));
    if (query.user_email) baseQuery.append("user_email", query.user_email);
    if (params.tags) {
      for (const tag of params.tags) baseQuery.append("tags", tag);
    }
    const qs = baseQuery.toString();
    if (qs) url += `?${qs}`;

    const res = await fetch(`${API_BASE}${url}`, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Devin API GET ${url} returned ${res.status}: ${text}`);
    }
    const data = await res.json();
    const sessions = data.sessions || data;

    if (!sessions.length) {
      return { content: [{ type: "text", text: "No sessions found." }] };
    }

    const text = sessions.map(formatSession).join("\n\n---\n\n");
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "get_session",
  "Get details of a specific Devin session via the REST API, including its messages and status.",
  {
    session_id: z.string().describe("The session ID (e.g. devin-abc123...)"),
  },
  async ({ session_id }) => {
    const result = await devinFetch(`/v1/sessions/${session_id}`);

    const parts = [formatSession(result)];

    if (result.structured_output) {
      parts.push(`\nStructured Output:\n${JSON.stringify(result.structured_output, null, 2)}`);
    }

    // Include recent messages if available
    if (result.messages?.length) {
      parts.push("\n--- Recent Messages ---");
      for (const msg of result.messages.slice(-10)) {
        const role = msg.role || msg.type || "unknown";
        const text = msg.message || msg.text || JSON.stringify(msg);
        parts.push(`[${role}]: ${text}`);
      }
    }

    return { content: [{ type: "text", text: parts.join("\n") }] };
  }
);

server.tool(
  "send_message",
  "Send a follow-up message to a running Devin session via the REST API.",
  {
    session_id: z.string().describe("The session ID to message"),
    message: z.string().describe("The message to send to Devin"),
  },
  async ({ session_id, message }) => {
    await devinFetch(`/v1/sessions/${session_id}/message`, {
      method: "POST",
      body: { message },
    });
    return {
      content: [{ type: "text", text: `Message sent to session ${session_id}.` }],
    };
  }
);

server.tool(
  "terminate_session",
  "Terminate/stop a running Devin session via the REST API.",
  {
    session_id: z.string().describe("The session ID to terminate"),
  },
  async ({ session_id }) => {
    const result = await devinFetch(`/v1/sessions/${session_id}`, { method: "DELETE" });
    return {
      content: [
        {
          type: "text",
          text: result?.detail || `Session ${session_id} terminated.`,
        },
      ],
    };
  }
);

// --- Playbook tools ---

server.tool(
  "list_playbooks",
  "List available Devin playbooks via the REST API (titles and IDs only). Use get_playbook to see full details.",
  {},
  async () => {
    const playbooks = await devinFetch("/v1/playbooks");
    if (!playbooks.length) {
      return { content: [{ type: "text", text: "No playbooks found." }] };
    }
    const text = playbooks
      .map((p) => `${p.title} (${p.playbook_id})`)
      .join("\n");
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "get_playbook",
  "Get full details of a specific Devin playbook via the REST API.",
  {
    playbook_id: z.string().describe("The playbook ID (e.g. playbook-abc123...)"),
  },
  async ({ playbook_id }) => {
    const playbook = await devinFetch(`/v1/playbooks/${playbook_id}`);
    const text = [
      `Title: ${playbook.title}`,
      `ID: ${playbook.playbook_id}`,
      `\n${playbook.body}`,
    ].join("\n");
    return { content: [{ type: "text", text }] };
  }
);

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);
