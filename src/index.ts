import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCommands } from "./commands.js";
import { registerTools } from "./tools.js";

/**
 * Entry point for this Pi Coding Agent extension.
 */
export default function register(api: ExtensionAPI): void {
	api.on("session_start", async (session) => {
		// Initialization hook
	});

	registerTools(api);
	registerCommands(api);
}
