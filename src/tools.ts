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
		description: "Scaffold a new Pi extension using the pi-extension-template.",
		parameters: Type.Object({
			name: Type.String({ description: "The name of the new package (e.g. pi-my-tool)" }),
			targetDir: Type.String({ description: "Directory to scaffold the extension in" }),
		}),
		execute: async ({ name, targetDir }: { name: string; targetDir: string }) => {
			try {
				const result = await createExtension(name, targetDir, TEMPLATE_DIR);
				return { content: [{ type: "text", text: result }] };
			} catch (e) {
				return { content: [{ type: "text", text: `Failed to create extension: ${(e as Error).message}` }], isError: true };
			}
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);

	api.registerTool({
		name: "retrofit_extension",
		description:
			"Automate the 6-step checklist from RETROFIT.md (Biome, Husky, package.json updates).",
		parameters: Type.Object({
			targetDir: Type.String({ description: "Directory of the extension to retrofit" }),
		}),
		execute: async ({ targetDir }: { targetDir: string }) => {
			try {
				const result = await retrofitExtension(targetDir);
				return { content: [{ type: "text", text: result }] };
			} catch (e) {
				return { content: [{ type: "text", text: `Failed to retrofit: ${(e as Error).message}` }], isError: true };
			}
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);

	api.registerTool({
		name: "verify_standards",
		description:
			"Verify if a Pi extension follows the template standards (Node 22, Husky v9, typebox devDep, Biome schema).",
		parameters: Type.Object({
			targetDir: Type.String({ description: "Directory of the extension to verify" }),
		}),
		execute: async ({ targetDir }: { targetDir: string }) => {
			try {
				const result = await verifyStandards(targetDir);
				return { content: [{ type: "text", text: result }] };
			} catch (e) {
				return { content: [{ type: "text", text: `Failed to verify: ${(e as Error).message}` }], isError: true };
			}
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);
}
