import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createExtension } from "./core.js";
import { retrofitExtension } from "./retrofit.js";
import { verifyStandards } from "./verify.js";

const TEMPLATE_DIR = path.resolve(import.meta.dirname, "..", "template");

export function registerCommands(api: ExtensionAPI) {
	api.registerCommand("create-extension", {
		description: "Scaffold a new Pi extension using the standard template.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const name = await ctx.ui.input("Extension name (e.g. pi-my-tool):");
			if (!name) return;

			const targetDir = await ctx.ui.input("Target directory:", `./${name}`);
			if (!targetDir) return;

			try {
				ctx.ui.notify(`Creating extension ${name} in ${targetDir}...`, "info");
				const result = await createExtension(name, targetDir, TEMPLATE_DIR);
				ctx.ui.notify(result, "info");
			} catch (e) {
				ctx.ui.notify(`Failed: ${(e as Error).message}`, "error");
			}
		},
	});

	api.registerCommand("retrofit-extension", {
		description: "Automate the 6-step checklist from RETROFIT.md.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const targetDir = await ctx.ui.input("Target directory:", ".");
			if (!targetDir) return;

			try {
				ctx.ui.notify(`Retrofitting extension in ${targetDir}...`, "info");
				const result = await retrofitExtension(targetDir);
				ctx.ui.notify(result, "info");
			} catch (e) {
				ctx.ui.notify(`Failed: ${(e as Error).message}`, "error");
			}
		},
	});

	api.registerCommand("verify-standards", {
		description: "Verify an extension against pi-extension-template standards.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const targetDir = await ctx.ui.input("Target directory:", ".");
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
		},
	});
}
