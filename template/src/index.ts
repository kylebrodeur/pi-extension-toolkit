import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Entry point for this Pi Coding Agent extension.
 *
 * Pi calls this function once when the extension is loaded, passing the
 * ExtensionAPI object. Use it to register event listeners, tools, and
 * commands. All registrations are scoped to this extension instance.
 *
 * @param api - The Pi extension API surface. Hold a reference if you need
 *              it inside async callbacks.
 */
export default function register(api: ExtensionAPI): void {
	// -------------------------------------------------------------------------
	// Event listeners
	// Pi fires lifecycle events you can hook into. The full list is on the
	// ExtensionAPI type — session_start and session_end are the most common.
	// -------------------------------------------------------------------------

	/**
	 * Runs once when a new Pi session begins (i.e. a conversation opens).
	 * Good place to load per-session state or inject a context message.
	 */
	api.on("session_start", async (session) => {
		await api.notify(`Extension loaded for session: ${session.id}`);
	});

	// -------------------------------------------------------------------------
	// Custom tools
	// Tools are functions Pi's LLM can invoke during a conversation.
	// Define the input schema with TypeBox — Pi uses it for validation and
	// to generate the tool description sent to the model.
	// -------------------------------------------------------------------------

	/**
	 * Example tool: echoes a message back to the conversation.
	 * Replace this with your real domain logic.
	 */
	api.registerTool(
		{
			name: "echo",
			description:
				"Echoes the provided message back into the conversation. Useful for testing that the extension is active.",
			parameters: Type.Object({
				message: Type.String({
					description: "The text to echo back.",
					minLength: 1,
				}),
			}),
		},
		async ({ message }) => {
			return { output: message };
		}
	);

	// -------------------------------------------------------------------------
	// Commands
	// Commands appear in Pi's command palette and can be invoked by the user
	// directly (not by the model). Use them for extension-level actions like
	// toggling a mode, clearing state, or opening a settings panel.
	// -------------------------------------------------------------------------

	/**
	 * Example command: clears any extension-local state.
	 * Replace with whatever teardown your extension needs.
	 */
	api.registerCommand(
		{
			name: "reset",
			description: "Resets the extension to its initial state.",
		},
		async () => {
			await api.notify("Extension state has been reset.");
		}
	);
}
