import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
// AutocompleteItem defined locally for minimal dependencies
interface AutocompleteItem {
	value: string;
	label: string;
	description?: string;
}
import { createExtension } from "./core.js";
import type { ToolkitResult } from "./lib/types.js";
import { retrofitExtension } from "./retrofit.js";
import { verifyStandards } from "./verify.js";

const TEMPLATE_DIR = path.resolve(import.meta.dirname, "..", "template");

const SUBCOMMANDS = ["create", "retrofit", "verify"] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function formatCreateSummary(result: ToolkitResult): string {
	const verb = result.isUpdate ? "Updated" : "Created";
	let summary = `${verb} extension: ${result.filesCreated.length} files created`;
	if (result.filesUpdated.length > 0) summary += `, ${result.filesUpdated.length} updated`;
	if (result.filesSkipped.length > 0) summary += `, ${result.filesSkipped.length} preserved`;
	if (result.conflicts.length > 0) summary += `, ⚠ ${result.conflicts.length} conflicts`;
	return summary;
}

function formatRetrofitSummary(result: ToolkitResult): string {
	if (result.filesCreated.length === 0 && result.filesUpdated.length === 0) {
		return "No changes needed.";
	}
	let summary = `Retrofit: ${result.filesUpdated.length} files updated`;
	if (result.filesCreated.length > 0) summary += `, ${result.filesCreated.length} created`;
	return summary;
}

export function registerCommands(api: ExtensionAPI) {
	api.registerCommand("ext-toolkit", {
		description: "Pi Extension Toolkit — scaffold, retrofit, and verify extensions",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items = SUBCOMMANDS.map((name) => ({ value: name, label: name }));
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const subcommand = args?.trim().split(/\s+/)[0] ?? "";
			const subArgs = args?.trim().slice(subcommand.length).trim() ?? "";

			switch (subcommand as Subcommand) {
				case "create": {
					const targetDir = subArgs || (await ctx.ui.input("Target directory:", "./my-extension"));
					if (!targetDir) return;
					const name =
						path.basename(targetDir) || (await ctx.ui.input("Extension name (e.g. pi-my-tool):"));
					if (!name) return;

					try {
						ctx.ui.setStatus("toolkit-create", `Creating ${name}...`);
						const result = await createExtension(TEMPLATE_DIR, {
							name,
							targetDir,
							force: false,
							backup: true,
						});
						ctx.ui.notify(formatCreateSummary(result), "info");
						ctx.ui.setStatus("toolkit-create", undefined);
					} catch (e) {
						ctx.ui.notify(`Failed: ${(e as Error).message}`, "error");
						ctx.ui.setStatus("toolkit-create", undefined);
					}
					break;
				}
				case "retrofit": {
					const targetDir = subArgs || (await ctx.ui.input("Target directory:", "."));
					if (!targetDir) return;

					try {
						ctx.ui.setStatus("toolkit-retrofit", `Retrofitting ${targetDir}...`);
						const result = await retrofitExtension({
							targetDir,
							force: false,
							backup: true,
						});
						ctx.ui.notify(formatRetrofitSummary(result), "info");
						ctx.ui.setStatus("toolkit-retrofit", undefined);
					} catch (e) {
						ctx.ui.notify(`Failed: ${(e as Error).message}`, "error");
						ctx.ui.setStatus("toolkit-retrofit", undefined);
					}
					break;
				}
				case "verify": {
					const targetDir = subArgs || (await ctx.ui.input("Target directory:", "."));
					if (!targetDir) return;

					try {
						const result = await verifyStandards(targetDir);
						if (result.includes("✅")) {
							ctx.ui.notify(result, "info");
						} else {
							ctx.ui.notify(`Verification failed:\n${result}`, "error");
						}
					} catch (e) {
						ctx.ui.notify(`Failed: ${(e as Error).message}`, "error");
					}
					break;
				}
				default: {
					ctx.ui.notify(
						"Usage: /ext-toolkit <create|retrofit|verify> [dir]\n" +
							"  create   — Scaffold a new extension from the standard template\n" +
							"  retrofit — Upgrade an existing extension to current standards\n" +
							"  verify   — Audit an extension for standards compliance",
						"info"
					);
				}
			}
		},
	});
}
