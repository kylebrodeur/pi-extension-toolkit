import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createExtension } from "./core.js";
import { retrofitExtension } from "./retrofit.js";
import { verifyStandards } from "./verify.js";

const TEMPLATE_DIR = path.resolve(import.meta.dirname, "..", "template");

export function registerTools(api: ExtensionAPI) {
	api.registerTool({
		name: "create_extension",
		label: "Create Extension",
		description: "Scaffold a new Pi extension using the pi-extension-template.",
		promptSnippet: "Scaffold a new Pi extension from the standard template",
		promptGuidelines: [
			"Use create_extension when the user asks to create, scaffold, or bootstrap a new Pi extension or Pi Coding Agent extension.",
		],
		parameters: Type.Object({
			name: Type.String({ description: "The name of the new package (e.g. pi-my-tool)" }),
			targetDir: Type.String({ description: "Directory to scaffold the extension in" }),
		}),
		async execute(
			toolCallId: string,
			{ name, targetDir }: { name: string; targetDir: string },
			signal?: AbortSignal,
			onUpdate?: (update: { content: Array<{ type: "text"; text: string }>; details?: unknown }) => void,
		) {
			const result = await createExtension(name, targetDir, TEMPLATE_DIR, {
				signal,
				onUpdate: (msg: string) => onUpdate?.({ content: [{ type: "text", text: msg }] }),
			});
			return { content: [{ type: "text", text: result }] };
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);

	api.registerTool({
		name: "retrofit_extension",
		label: "Retrofit Extension",
		description:
			"Automate the 6-step checklist from RETROFIT.md (Biome, Husky, package.json updates).",
		promptSnippet: "Upgrade an existing Pi extension to current standards",
		promptGuidelines: [
			"Use retrofit_extension when the user asks to upgrade, fix, or modernize an existing Pi extension to meet current template standards.",
		],
		parameters: Type.Object({
			targetDir: Type.String({ description: "Directory of the extension to retrofit" }),
		}),
		async execute(
			toolCallId: string,
			{ targetDir }: { targetDir: string },
			signal?: AbortSignal,
			onUpdate?: (update: { content: Array<{ type: "text"; text: string }>; details?: unknown }) => void,
		) {
			const result = await retrofitExtension(targetDir, {
				signal,
				onUpdate: (msg: string) => onUpdate?.({ content: [{ type: "text", text: msg }] }),
			});
			return { content: [{ type: "text", text: result }] };
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);

	api.registerTool({
		name: "verify_standards",
		label: "Verify Standards",
		description:
			"Verify if a Pi extension follows the template standards (Node 22, Husky v9, typebox devDep, Biome schema).",
		promptSnippet: "Audit a Pi extension for standards compliance",
		promptGuidelines: [
			"Use verify_standards when the user asks to audit, check, or validate a Pi extension against the template standards.",
		],
		parameters: Type.Object({
			targetDir: Type.String({ description: "Directory of the extension to verify" }),
		}),
		execute: async (
			toolCallId: string,
			{ targetDir }: { targetDir: string },
		) => {
			const result = await verifyStandards(targetDir);
			return { content: [{ type: "text", text: result }] };
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);
}
