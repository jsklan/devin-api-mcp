import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v3Fetch, paginationParams, formatPaginatedResponse } from "./shared.js";

interface Playbook {
  playbook_id: string;
  title: string;
  body: string;
  macro: string | null;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
  access_type: string;
  org_id: string | null;
}

function formatPlaybook(p: Playbook): string {
  const parts = [
    `Playbook: ${p.playbook_id}`,
    `Title: ${p.title}`,
  ];
  if (p.macro) parts.push(`Macro: ${p.macro}`);
  parts.push(`Created by: ${p.created_by}`);
  parts.push(`Updated by: ${p.updated_by}`);
  return parts.join("\n");
}

export function registerPlaybookTools(server: McpServer): void {
  server.tool(
    "list_playbooks",
    "List playbooks in the organization. Returns playbook IDs, titles, and metadata.",
    {
      ...paginationParams,
    },
    async (params) => {
      const data = await v3Fetch("/playbooks", {
        query: { after: params.after, first: params.first },
      });
      const text = formatPaginatedResponse<Playbook>(
        data,
        formatPlaybook,
        "No playbooks found."
      );
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "create_playbook",
    "Create a new playbook. Playbooks define reusable instruction sets for Devin sessions.",
    {
      title: z.string().min(1).describe("Playbook title"),
      body: z.string().min(1).describe("Playbook content/instructions"),
      macro: z
        .string()
        .nullable()
        .optional()
        .describe("Optional macro identifier (null to clear)"),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        title: params.title,
        body: params.body,
      };
      if (params.macro !== undefined) body.macro = params.macro;

      const result: Playbook = await v3Fetch("/playbooks", {
        method: "POST",
        body,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Playbook created: ${result.title} (${result.playbook_id})`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_playbook",
    "Get full details of a specific playbook including its body content.",
    {
      playbook_id: z.string().describe("The playbook ID to retrieve"),
    },
    async ({ playbook_id }) => {
      const p: Playbook = await v3Fetch(`/playbooks/${playbook_id}`);
      const text = [
        `Title: ${p.title}`,
        `ID: ${p.playbook_id}`,
        p.macro ? `Macro: ${p.macro}` : "",
        `Created by: ${p.created_by}`,
        `Updated by: ${p.updated_by}`,
        `\n${p.body}`,
      ]
        .filter(Boolean)
        .join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "update_playbook",
    "Update an existing playbook by ID.",
    {
      playbook_id: z.string().describe("The playbook ID to update"),
      title: z.string().min(1).describe("Updated title"),
      body: z.string().min(1).describe("Updated content/instructions"),
      macro: z
        .string()
        .nullable()
        .optional()
        .describe("Updated macro (null to clear)"),
    },
    async ({ playbook_id, ...fields }) => {
      const body: Record<string, unknown> = {
        title: fields.title,
        body: fields.body,
      };
      if (fields.macro !== undefined) body.macro = fields.macro;

      const result: Playbook = await v3Fetch(`/playbooks/${playbook_id}`, {
        method: "PUT",
        body,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Playbook updated: ${result.title} (${result.playbook_id})`,
          },
        ],
      };
    }
  );

  server.tool(
    "delete_playbook",
    "Delete a playbook from the organization. This is permanent.",
    {
      playbook_id: z.string().describe("The playbook ID to delete"),
    },
    async ({ playbook_id }) => {
      const result: Playbook = await v3Fetch(`/playbooks/${playbook_id}`, {
        method: "DELETE",
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Playbook deleted: ${result.title} (${result.playbook_id})`,
          },
        ],
      };
    }
  );
}
