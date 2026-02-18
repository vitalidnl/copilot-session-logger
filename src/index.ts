import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

type SaveCopilotSessionArgs = {
  transcriptMarkdown?: string;
  savedAt?: string;
  workspaceRoot?: string;
};

function parseCliArgs(argv: string[]): { workspaceRoot?: string } {
  const args = argv.slice(2);
  const idx = args.findIndex((a) => a === "--workspaceRoot");
  if (idx >= 0 && args[idx + 1]) {
    return { workspaceRoot: args[idx + 1] };
  }
  return {};
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function formatDateFolder(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function formatTimeDash(d: Date): string {
  return `${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

function formatTimeDashMs(d: Date): string {
  return `${formatTimeDash(d)}-${pad3(d.getMilliseconds())}`;
}

function formatTimeColon(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

function applyTemplate(template: string, replacements: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(key).join(value);
  }
  return out;
}

async function loadOrCreateTemplate(logRoot: string): Promise<string> {
  const templatePath = path.join(logRoot, "_TEMPLATE.md");
  if (await fileExists(templatePath)) {
    return fs.readFile(templatePath, "utf8");
  }

  const defaultTemplate =
    "# Copilot chat session {{DATE}} {{TIME_COLON}}\n\n" +
    "## Conversation\n\n" +
    "{{TRANSCRIPT}}\n";

  await fs.writeFile(templatePath, defaultTemplate, "utf8");
  return defaultTemplate;
}

async function saveCopilotSession(args: SaveCopilotSessionArgs): Promise<{ savedPath: string } | { error: string }> {
  const savedAt = args.savedAt ? new Date(args.savedAt) : new Date();
  if (Number.isNaN(savedAt.getTime())) {
    return { error: "Invalid 'savedAt' value. Expected an ISO-8601 datetime string." };
  }

  const workspaceRoot = args.workspaceRoot ?? process.cwd();
  const logRoot = path.join(workspaceRoot, "copilot-session_log");
  const dateFolder = formatDateFolder(savedAt);
  const timeDashMs = formatTimeDashMs(savedAt);

  const outDir = path.join(logRoot, dateFolder);
  await ensureDir(outDir);

  const baseName = `session_${timeDashMs}.md`;
  const outPath = path.join(outDir, baseName);

  const template = await loadOrCreateTemplate(logRoot);

  const transcript = (args.transcriptMarkdown ?? "").trim();
  if (!transcript) {
    return {
      error:
        "No transcript provided. This tool expects Copilot to pass the full conversation Markdown as 'transcriptMarkdown' when invoking save-copilot-session.",
    };
  }

  const rendered = applyTemplate(template, {
    "{{DATE}}": dateFolder,
    "{{TIME_COLON}}": formatTimeColon(savedAt),
    "{{TIME_DASH}}": formatTimeDash(savedAt),
    "{{TIME_DASH_MS}}": timeDashMs,
    "{{WORKSPACE_ROOT}}": workspaceRoot,
    "{{PROJECT_NAME}}": path.basename(workspaceRoot),
    "{{OS}}": process.platform,
    "{{MODEL}}": "GPT-5.2",
    "{{TRANSCRIPT}}": transcript,
  });

  await fs.writeFile(outPath, rendered, "utf8");
  return { savedPath: outPath };
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv);

  const server = new Server(
    {
      name: "copilot-session-logger",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "save-copilot-session",
          description:
            "Saves the current Copilot chat session to copilot-session_log/{dd-MM-yyyy}/session_{HH-mm-ss-SSS}.md (milliseconds included) using copilot-session_log/_TEMPLATE.md. IMPORTANT: when invoking, include the full chat transcript as Markdown in transcriptMarkdown.",
          inputSchema: {
            type: "object",
            properties: {
              transcriptMarkdown: {
                type: "string",
                description:
                  "Full conversation transcript in Markdown. The client (Copilot) should populate this automatically when you run the command.",
              },
              savedAt: {
                type: "string",
                description:
                  "Optional ISO-8601 datetime string. If omitted, local current time is used.",
              },
              workspaceRoot: {
                type: "string",
                description:
                  "Optional override for workspace root path. Normally passed via server --workspaceRoot.",
              },
            },
            required: [],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "save-copilot-session") {
      return {
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }

    const input = (req.params.arguments ?? {}) as SaveCopilotSessionArgs;
    const result = await saveCopilotSession({
      ...input,
      workspaceRoot: input.workspaceRoot ?? cli.workspaceRoot ?? process.cwd(),
    });

    if ("error" in result) {
      return {
        content: [{ type: "text", text: result.error }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: result.savedPath }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
