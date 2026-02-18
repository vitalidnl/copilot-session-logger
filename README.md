# copilot-session-logger

Local-only MCP server that provides a single tool: `save-copilot-session`.

## What it does

When you run `save-copilot-session`, it writes a Markdown file using the workspace template:

- Template: `copilot-session-log/_TEMPLATE.md`
- Output: `copilot-session-log/{dd-MM-yyyy}/session_{HH-mm-ss-SSS}.md` (milliseconds included)

The `{dd-MM-yyyy}` folder is based on **when you save** (not the session start time).

## Install (local)

This server is intended to run locally only.

### Install from a local clone (recommended for private repo)

1. Clone this repo somewhere on your machine.
2. In the repo folder:
   - `npm install`
   - `npm run build`
   - `npm link` (installs the `copilot-session-logger` command locally)
3. Use VS Code MCP config to run it via `node dist/index.js` or via the `copilot-session-logger` bin.

## VS Code MCP configuration

Add a server entry to your project's `.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "copilot-session-logger": {
      "type": "stdio",
      "command": "copilot-session-logger",
      "args": ["--workspaceRoot", "${workspaceFolder}"]
    }
  }
}
```

## Template notes

Your project should have `copilot-session-log/_TEMPLATE.md`.

To ensure the transcript lands where you want it, include `{{TRANSCRIPT}}` in the template.

## Tool input

- `transcriptMarkdown` (string): full conversation transcript in Markdown (written verbatim; no summarization)
- `messages` (array, optional): alternative to `transcriptMarkdown`; array of `{ role, content }` messages that will be rendered into Markdown as `### User` / `### Assistant` sections
- `savedAt` (string, optional): ISO-8601 datetime

If neither `transcriptMarkdown` nor `messages` are provided, the tool returns an error.

## Note on “full assistant responses”

This server **does not** summarize. It saves exactly what the client provides.

If you notice assistant sections are “too compact”, it means the client sent a compact transcript. In that case, invoke the tool in a way that provides the full text (either as `transcriptMarkdown` or as `messages`).
