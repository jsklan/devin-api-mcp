import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { v3FetchFormData, getOrgId } from "./shared.js";

export function registerAttachmentTools(server: McpServer): void {
  // --- upload_attachment ---
  server.tool(
    "upload_attachment",
    "Upload a file attachment via the v3 Organization API. Returns an attachment ID, name, and URL for use in session prompts.",
    {
      file_path: z.string().describe("Absolute path to the file to upload"),
    },
    async ({ file_path }) => {
      const fileBuffer = await readFile(file_path);
      const fileName = basename(file_path);
      const blob = new Blob([fileBuffer]);
      const formData = new FormData();
      formData.append("file", blob, fileName);

      const result = await v3FetchFormData("/attachments", formData);
      const attachmentId = result.attachment_id || result.id;
      const name = result.name || fileName;
      const url = result.url || "";

      return {
        content: [{
          type: "text" as const,
          text: [
            `File uploaded: ${name}`,
            `Attachment ID: ${attachmentId}`,
            `URL: ${url}`,
            ``,
            `To use in a session prompt, reference the URL or attachment ID.`,
          ].join("\n"),
        }],
      };
    }
  );

  // --- get_attachment ---
  server.tool(
    "get_attachment",
    "Get the download URL for an attachment. The API returns a redirect to a presigned URL — this tool returns that URL.",
    {
      uuid: z.string().describe("The attachment UUID"),
      name: z.string().describe("The attachment filename"),
    },
    async ({ uuid, name }) => {
      // The API endpoint returns a 307 redirect to a presigned download URL.
      // We construct and return the API URL which will redirect to the actual file.
      const orgId = getOrgId();
      const downloadUrl = `https://api.devin.ai/v3/organizations/${orgId}/attachments/${uuid}/${name}`;

      return {
        content: [{
          type: "text" as const,
          text: [
            `Attachment: ${name} (${uuid})`,
            `Download URL: ${downloadUrl}`,
            ``,
            `Note: This URL returns a 307 redirect to a time-limited presigned download URL.`,
          ].join("\n"),
        }],
      };
    }
  );
}
