import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v3Fetch } from "./shared.js";

interface ScheduleResponse {
  scheduled_session_id: string;
  org_id: string;
  created_by: string | null;
  name: string;
  prompt: string;
  playbook: { playbook_id: string; title: string } | null;
  frequency: string | null;
  enabled: boolean;
  agent: string;
  notify_on: string;
  schedule_type: string;
  last_executed_at: string | null;
  scheduled_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
  slack_channel_id: string | null;
  slack_team_id: string | null;
}

function formatSchedule(s: ScheduleResponse): string {
  const parts = [
    `Schedule: ${s.name} (${s.scheduled_session_id})`,
    `Type: ${s.schedule_type} | Agent: ${s.agent} | Enabled: ${s.enabled}`,
    `Prompt: ${s.prompt.length > 120 ? s.prompt.slice(0, 120) + "..." : s.prompt}`,
  ];
  if (s.frequency) parts.push(`Frequency: ${s.frequency}`);
  if (s.scheduled_at) parts.push(`Scheduled at: ${s.scheduled_at}`);
  if (s.playbook) parts.push(`Playbook: ${s.playbook.title} (${s.playbook.playbook_id})`);
  parts.push(`Notify on: ${s.notify_on}`);
  if (s.last_executed_at) parts.push(`Last executed: ${s.last_executed_at}`);
  if (s.last_error_message) parts.push(`Last error: ${s.last_error_message} (at ${s.last_error_at})`);
  if (s.consecutive_failures > 0) parts.push(`Consecutive failures: ${s.consecutive_failures}`);
  if (s.created_by) parts.push(`Created by: ${s.created_by}`);
  parts.push(`Created: ${s.created_at} | Updated: ${s.updated_at}`);
  if (s.slack_channel_id) parts.push(`Slack channel: ${s.slack_channel_id}`);
  if (s.slack_team_id) parts.push(`Slack team: ${s.slack_team_id}`);
  return parts.join("\n");
}

export function registerScheduleTools(server: McpServer): void {
  // --- list_schedules ---
  server.tool(
    "list_schedules",
    "List scheduled Devin sessions for the organization. Uses offset-based pagination.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Number of schedules per page (default 50, max 100)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
    },
    async (params) => {
      const data = await v3Fetch("/schedules", {
        query: {
          limit: params.limit ?? 50,
          offset: params.offset ?? 0,
        },
      });

      const items: ScheduleResponse[] = Array.isArray(data) ? data : data.items || data.schedules || [];
      if (!items.length) {
        return { content: [{ type: "text" as const, text: "No schedules found." }] };
      }

      const text = items.map(formatSchedule).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // --- create_schedule ---
  server.tool(
    "create_schedule",
    "Create a new scheduled Devin session. Use frequency (cron) for recurring or scheduled_at (ISO 8601) for one-time.",
    {
      name: z.string().describe("Name for the schedule"),
      prompt: z.string().describe("The task/instructions for Devin to execute on schedule"),
      agent: z.enum(["devin", "data_analyst", "advanced"]).optional().describe("Agent type (default: devin)"),
      schedule_type: z.enum(["recurring", "one_time"]).optional().describe("Schedule type (default: recurring)"),
      frequency: z.string().optional().describe("Cron expression for recurring schedules (e.g. '0 9 * * 1' for every Monday at 9am)"),
      scheduled_at: z.string().optional().describe("ISO 8601 datetime for one-time schedules"),
      playbook_id: z.string().optional().describe("Playbook ID to use for scheduled sessions"),
      notify_on: z.enum(["always", "failure", "never"]).optional().describe("When to send notifications (default: failure)"),
      create_as_user_id: z.string().optional().describe("User ID to create sessions as"),
      slack_channel_id: z.string().optional().describe("Slack channel ID for notifications"),
      slack_team_id: z.string().optional().describe("Slack team/workspace ID for notifications"),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        name: params.name,
        prompt: params.prompt,
      };
      if (params.agent) body.agent = params.agent;
      if (params.schedule_type) body.schedule_type = params.schedule_type;
      if (params.frequency) body.frequency = params.frequency;
      if (params.scheduled_at) body.scheduled_at = params.scheduled_at;
      if (params.playbook_id) body.playbook_id = params.playbook_id;
      if (params.notify_on) body.notify_on = params.notify_on;
      if (params.create_as_user_id) body.create_as_user_id = params.create_as_user_id;
      if (params.slack_channel_id) body.slack_channel_id = params.slack_channel_id;
      if (params.slack_team_id) body.slack_team_id = params.slack_team_id;

      const result = await v3Fetch("/schedules", { method: "POST", body });
      return {
        content: [{
          type: "text" as const,
          text: `Schedule created: ${result.name} (${result.scheduled_session_id})`,
        }],
      };
    }
  );

  // --- get_schedule ---
  server.tool(
    "get_schedule",
    "Get details of a specific scheduled Devin session.",
    {
      schedule_id: z.string().describe("The schedule ID (scheduled_session_id)"),
    },
    async ({ schedule_id }) => {
      const result: ScheduleResponse = await v3Fetch(`/schedules/${schedule_id}`);
      return {
        content: [{ type: "text" as const, text: formatSchedule(result) }],
      };
    }
  );

  // --- update_schedule ---
  server.tool(
    "update_schedule",
    "Update an existing scheduled Devin session. All fields are optional — only provided fields are updated.",
    {
      schedule_id: z.string().describe("The schedule ID to update"),
      name: z.string().optional().describe("Updated schedule name"),
      enabled: z.boolean().optional().describe("Enable or disable the schedule"),
      schedule_type: z.enum(["recurring", "one_time"]).optional().describe("Updated schedule type"),
      frequency: z.string().nullable().optional().describe("Updated cron expression (null to clear)"),
      scheduled_at: z.string().nullable().optional().describe("Updated ISO 8601 datetime (null to clear)"),
      prompt: z.string().optional().describe("Updated prompt/instructions"),
      playbook_id: z.string().nullable().optional().describe("Updated playbook ID (null to clear)"),
      agent: z.enum(["devin", "data_analyst", "advanced"]).optional().describe("Updated agent type"),
      notify_on: z.enum(["always", "failure", "never"]).optional().describe("Updated notification setting"),
      run_as_user_id: z.string().nullable().optional().describe("Updated user ID to run sessions as (null to clear)"),
      slack_channel_id: z.string().nullable().optional().describe("Updated Slack channel ID (null to clear)"),
      slack_team_id: z.string().nullable().optional().describe("Updated Slack team ID (null to clear)"),
    },
    async ({ schedule_id, ...fields }) => {
      // Build body with only provided fields (including explicit nulls)
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          body[key] = value;
        }
      }

      const result = await v3Fetch(`/schedules/${schedule_id}`, { method: "PATCH", body });
      return {
        content: [{
          type: "text" as const,
          text: `Schedule ${schedule_id} updated.${result?.name ? ` Name: ${result.name}` : ""}`,
        }],
      };
    }
  );

  // --- delete_schedule ---
  server.tool(
    "delete_schedule",
    "Delete a scheduled Devin session. This is permanent.",
    {
      schedule_id: z.string().describe("The schedule ID to delete"),
    },
    async ({ schedule_id }) => {
      await v3Fetch(`/schedules/${schedule_id}`, { method: "DELETE" });
      return {
        content: [{ type: "text" as const, text: `Schedule ${schedule_id} deleted.` }],
      };
    }
  );
}
