---
change_log:
  - timestamp: 2026-06-09T22:00:00Z
    agent_id: "pi-agent"
    note: "Initial creation of AGENTS.template.md for pi-extension-template — scaffolded into new projects by create_extension."
---
# Project: {{PROJECT_NAME}}

This is a Pi Coding Agent extension. It extends Pi's behavior by registering tools, commands, and event handlers.

## Tech Stack
- **Language**: TypeScript (Node.js)
- **Build**: `tsc` (TypeScript Compiler)
- **Lint/Format**: Biome
- **Test**: `node test.js`
- **Pi SDK**: `@earendil-works/pi-coding-agent`
- **Schema Validation**: `typebox`

## Architecture
- **Entry Point**: `src/index.ts` — exports a default function receiving `ExtensionAPI`
- **Tools**: Registered via `pi.registerTool()` — callable by the LLM
- **Commands**: Registered via `pi.registerCommand()` — user-invokable `/slash` commands
- **Events**: Subscribe via `pi.on()` — lifecycle hooks (`session_start`, `tool_call`, etc.)

## Development Workflow
- **Build**: `npm run build` — outputs to `dist/`
- **TypeCheck**: `npm run check` — Biome + tsc --noEmit
- **Test**: `npm test` (add your tests to `test.js`)
- **Dev**: `npm run dev` — tsc in watch mode
- **Pre-commit**: Husky runs Biome check + tsc --noEmit

## Extension Patterns

### Tool Registration
```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does",
  promptSnippet: "One-line description for the LLM",
  promptGuidelines: ["Use my_tool when..."],
  parameters: Type.Object({ ... }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return { content: [{ type: "text", text: "Result" }] };
  },
});
```

### Command Registration
```typescript
pi.registerCommand("my-command", {
  description: "What this command does",
  getArgumentCompletions: (prefix) => [
    { value: "subcommand", label: "subcommand" },
  ],
  handler: async (args, ctx) => {
    ctx.ui.notify("Done!", "info");
  },
});
```

### Error Handling
- Throw errors from `execute()` to signal failure to the LLM
- Do not return `isError: true` — the SDK ignores it
- Use `ctx.ui.notify(message, "error")` for user-facing errors in commands

## Standards

This project was scaffolded by `pi-extension-toolkit` and follows the `pi-extension-template` standards:
- **Node 22 LTS**, ESM (`"type": "module"`)
- **Biome** for linting/formatting with the latest schema
- **Husky v9** pre-commit hooks
- **GitHub Actions** with Node 22 and provenance publishing
- **typebox** in devDependencies only

## Notes for Agents
- When adding tools, always provide `label`, `promptSnippet`, and `promptGuidelines`
- When adding commands, use `getArgumentCompletions` for discoverability
- Prefix command names with a namespace (e.g., `my-ext do-something` instead of bare `do-something`)
- Run `npm run check` before committing; Husky enforces this
- Build output goes to `dist/`; do not import from `src/` at runtime
