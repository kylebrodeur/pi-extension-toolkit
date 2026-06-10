import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
	applyChanges,
	buildManifest,
	computeChanges,
	hashFile,
	isToolkitInstalled,
	saveManifest,
	walkDir,
} from "./lib/updater.js";
import type { FileChange, ToolkitOptions, ToolkitResult } from "./lib/types.js";

/**
 * Execute a command with AbortSignal support. Kills the process on abort.
 */
function execWithSignal(
	command: string,
	args: string[],
	options: { cwd?: string; signal?: AbortSignal },
): Promise<{ stdout: string; stderr: string; code: number | null; killed: boolean }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: "pipe",
		});

		let stdout = "";
		let stderr = "";
		let killed = false;

		child.stdout?.on("data", (data: Buffer) => {
			stdout += data.toString();
		});
		child.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		child.on("error", (err) => {
			if (killed) return;
			reject(err);
		});

		child.on("close", (code) => {
			resolve({ stdout, stderr, code, killed });
		});

		if (options.signal) {
			const onAbort = () => {
				killed = true;
				child.kill("SIGTERM");
				if (!child.killed) {
					setTimeout(() => {
						if (!child.killed) child.kill("SIGKILL");
					}, 1000);
				}
			};
			if (options.signal.aborted) {
				onAbort();
			} else {
				options.signal.addEventListener("abort", onAbort, { once: true });
			}
		}
	});
}

function getPackageVersion(): string {
	try {
		const pkg = JSON.parse(
			readFileSync(path.resolve(import.meta.dirname, "..", "package.json"), "utf-8"),
		);
		return pkg.version;
	} catch {
		return "0.0.0";
	}
}

export interface RetrofitExtensionOptions extends ToolkitOptions {
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Progress callback for streaming status updates */
	onUpdate?: (msg: string) => void;
}

/** Patches to apply to an extension during retrofit */
interface RetrofitPatch {
	relativePath: string;
	type: "replace" | "add-file" | "regex-replace";
	oldContent?: string;
	newContent?: string;
	/** Regex pattern + replacement (used for tsconfig.json) */
	pattern?: RegExp;
	replacement?: string;
	description: string;
	/** If true, this patch runs only once (fresh) or only on update */
	runOn: "always" | "fresh-only" | "update-only";
}

/** Check if a field exists and set it */
function hasValue(obj: unknown, path: string): boolean {
	const parts = path.split(".");
	// biome-ignore lint/suspicious/noExplicitAny: recursive traversal
	let current: any = obj;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return false;
		if (!(part in current)) return false;
		// biome-ignore lint/suspicious/noExplicitAny: recursive traversal
		current = (current as any)[part];
	}
	return current !== undefined && current !== null;
}

/**
 * Retrofit an existing Pi extension to match current template standards.
 *
 * Uses safe update logic: if the target already has a toolkit manifest,
 * only applies patches that haven't been user-modified.
 */
export async function retrofitExtension(
	options: RetrofitExtensionOptions,
): Promise<ToolkitResult> {
	const startTime = Date.now();
	const {
		targetDir,
		signal,
		onUpdate,
		force = false,
		backup = true,
		dryRun = false,
	} = options;

	if (signal?.aborted) throw new Error("Operation cancelled");

	const absoluteTarget = path.resolve(targetDir);
	const version = getPackageVersion();
	const isUpdate = isToolkitInstalled(absoluteTarget);

	// Read current package.json
	const pkgPath = path.join(absoluteTarget, "package.json");
	// biome-ignore lint/suspicious/noExplicitAny: parsed from JSON
	let pkg: any;
	try {
		pkg = JSON.parse(await fsp.readFile(pkgPath, "utf-8"));
	} catch {
		throw new Error("Could not read package.json. Are you in a Pi extension directory?");
	}

	// Build list of patches
	const patches: RetrofitPatch[] = [];

	// package.json patches
	if (!pkg.exports) {
		patches.push({
			relativePath: "package.json",
			type: "replace",
			description: "Add exports field",
			runOn: isUpdate ? "update-only" : "fresh-only",
		});
	}
	if (!pkg.files) {
		patches.push({
			relativePath: "package.json",
			type: "replace",
			description: "Add files array",
			runOn: "always",
		});
	}
	if (!pkg.keywords || !pkg.keywords.includes("pi-package")) {
		patches.push({
			relativePath: "package.json",
			type: "replace",
			description: "Add pi-package keyword",
			runOn: "always",
		});
	}
	if (!pkg.pi || !pkg.pi.extensions) {
		patches.push({
			relativePath: "package.json",
			type: "replace",
			description: "Add pi.extensions manifest",
			runOn: "always",
		});
	}
	if (pkg.type !== "module") {
		patches.push({
			relativePath: "package.json",
			type: "replace",
			description: "Set type: module",
			runOn: "always",
		});
	}
	if (pkg.dependencies?.["@sinclair/typebox"] || pkg.dependencies?.typebox) {
		patches.push({
			relativePath: "package.json",
			type: "replace",
			description: "Move typebox to devDependencies",
			runOn: "always",
		});
	}
	if (!pkg.devDependencies?.["@earendil-works/pi-coding-agent"]) {
		patches.push({
			relativePath: "package.json",
			type: "replace",
			description: "Add @earendil-works/pi-coding-agent devDep",
			runOn: "always",
		});
	}
	if (pkg.scripts?.prepare !== "husky") {
		patches.push({
			relativePath: "package.json",
			type: "replace",
			description: "Set prepare script to husky",
			runOn: "always",
		});
	}

	// biome.json patch
	const biomePath = path.join(absoluteTarget, "biome.json");
	if (!hasValue(pkg, "biomeFixed")) {
		try {
			const biome = JSON.parse(await fsp.readFile(biomePath, "utf-8"));
			if (biome.$schema !== "https://biomejs.dev/schemas/latest/schema.json") {
				patches.push({
					relativePath: "biome.json",
					type: "replace",
					description: "Fix biome.json schema URL",
					runOn: "always",
				});
			}
		} catch {
			patches.push({
				relativePath: "biome.json",
				type: "replace",
				description: "Fix biome.json (invalid JSON)",
				runOn: "always",
			});
		}
	}

	// tsconfig.json patches
	const tsconfigPath = path.join(absoluteTarget, "tsconfig.json");
	try {
		let tsconfigStr = await fsp.readFile(tsconfigPath, "utf-8");
		if (/"module"\s*:\s*"CommonJS"/.test(tsconfigStr)) {
			patches.push({
				relativePath: "tsconfig.json",
				type: "regex-replace",
				pattern: /"module"\s*:\s*"CommonJS"/,
				replacement: '"module": "NodeNext"',
				description: "Update module to NodeNext",
				runOn: "always",
			});
		}
		if (/"moduleResolution"\s*:\s*"Node"/.test(tsconfigStr)) {
			patches.push({
				relativePath: "tsconfig.json",
				type: "regex-replace",
				pattern: /"moduleResolution"\s*:\s*"Node"/,
				replacement: '"moduleResolution": "NodeNext"',
				description: "Update moduleResolution to NodeNext",
				runOn: "always",
			});
		}
		if (/"target"\s*:\s*"ES2022"/.test(tsconfigStr)) {
			patches.push({
				relativePath: "tsconfig.json",
				type: "regex-replace",
				pattern: /"target"\s*:\s*"ES2022"/,
				replacement: '"target": "ESNext"',
				description: "Update target to ESNext",
				runOn: "always",
			});
		}
	} catch {
		// tsconfig.json may not exist
	}

	// For safe update, compute what can be applied
	const applicablePatches = patches.filter((p) => p.runOn === "always" || p.runOn === (isUpdate ? "update-only" : "fresh-only"));

	// Build changes from patches
	const changes: FileChange[] = [];
	const patchedFiles = new Set<string>();
	for (const patch of applicablePatches) {
		const targetPath = path.join(absoluteTarget, patch.relativePath);

		if (!existsSync(targetPath)) {
			changes.push({
				relativePath: patch.relativePath,
				action: "created",
				reason: patch.description,
			});
		} else if (isUpdate && !force && patchedFiles.has(patch.relativePath)) {
			changes.push({
				relativePath: patch.relativePath,
				action: "skipped",
				reason: "User may have modified; skipped. Use force:true to overwrite.",
			});
		} else {
			changes.push({
				relativePath: patch.relativePath,
				action: "updated",
				reason: patch.description,
			});
		}
		patchedFiles.add(patch.relativePath);
	}

	// Husky setup
	const huskyDir = path.join(absoluteTarget, ".husky");
	if (!existsSync(huskyDir)) {
		changes.push({
			relativePath: ".husky/pre-commit",
			action: "created",
			reason: "Install Husky v9 with pre-commit hook",
		});
	}

	if (dryRun) {
		const dryRunResult = {
			wouldExecute: true,
			operation: "retrofit" as const,
			changes,
			summary: {
				filesCreated: changes.filter((c) => c.action === "created").map((c) => c.relativePath),
				filesUpdated: changes.filter((c) => c.action === "updated").map((c) => c.relativePath),
				filesSkipped: changes
					.filter((c) => c.action === "skipped")
					.map((c) => `${c.relativePath} (${c.reason})`),
				filesWithConflicts: changes
					.filter((c) => c.action === "conflict")
					.map((c) => `${c.relativePath} (${c.reason})`),
			},
		};
		return {
			targetDir: absoluteTarget,
			filesCreated: [],
			filesUpdated: [],
			filesSkipped: [],
			conflicts: [JSON.stringify(dryRunResult)],
			backupDir: null,
			isUpdate,
			operation: "retrofit",
			durationMs: Date.now() - startTime,
		};
	}

	// --- Apply patches ---
	const created: string[] = [];
	const updated: string[] = [];
	const skipped: string[] = [];
	const conflicts: string[] = [];

	for (const change of changes) {
		if (change.action === "skipped") {
			skipped.push(`${change.relativePath} (${change.reason})`);
			continue;
		}

		const targetPath = path.join(absoluteTarget, change.relativePath);

		if (change.relativePath === "package.json") {
			// Apply all package.json patches
			if (!pkg.exports) {
				pkg.exports = {
					".": { import: "./dist/index.js", require: "./dist/index.js", types: "./dist/index.d.ts" },
				};
			}
			if (!pkg.files) pkg.files = ["dist", "README.md"];
			if (!pkg.keywords) pkg.keywords = [];
			if (!pkg.keywords.includes("pi-package")) pkg.keywords.push("pi-package");
			if (!pkg.pi) pkg.pi = { extensions: ["./dist"] };
			else if (!pkg.pi.extensions) pkg.pi.extensions = ["./dist"];
			if (pkg.type !== "module") pkg.type = "module";
			if (pkg.dependencies?.["@sinclair/typebox"]) delete pkg.dependencies["@sinclair/typebox"];
			if (pkg.dependencies?.typebox) delete pkg.dependencies.typebox;
			if (!pkg.devDependencies) pkg.devDependencies = {};
			pkg.devDependencies.typebox = "^1.1.0";
			if (!pkg.devDependencies["@earendil-works/pi-coding-agent"]) {
				pkg.devDependencies["@earendil-works/pi-coding-agent"] = "^0.79.0";
			}
			if (!pkg.scripts) pkg.scripts = {};
			pkg.scripts.prepare = "husky";

			await fsp.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
			updated.push("package.json");
		} else if (change.relativePath === "biome.json") {
			try {
				const biome = JSON.parse(await fsp.readFile(biomePath, "utf-8"));
				biome.$schema = "https://biomejs.dev/schemas/latest/schema.json";
				await fsp.writeFile(biomePath, `${JSON.stringify(biome, null, 2)}\n`);
				updated.push("biome.json");
			} catch {
				skipped.push("biome.json (invalid JSON, could not fix)");
			}
		} else if (change.relativePath === "tsconfig.json") {
			let content = await fsp.readFile(targetPath, "utf-8");
			for (const p of applicablePatches) {
				if (p.relativePath === "tsconfig.json" && p.type === "regex-replace" && p.pattern) {
					content = content.replace(p.pattern, p.replacement!);
				}
			}
			await fsp.writeFile(targetPath, content);
			updated.push("tsconfig.json");
		} else if (change.relativePath === ".husky/pre-commit") {
			try {
				onUpdate?.("Installing Husky v9...");
				const installResult = await execWithSignal(
					"npm", ["install", "--save-dev", "husky@^9.0.0"],
					{ cwd: absoluteTarget, signal },
				);
				if (installResult.killed) throw new Error("Operation cancelled");

				const initResult = await execWithSignal(
					"npx", ["husky", "init"],
					{ cwd: absoluteTarget, signal },
				);
				if (initResult.killed) throw new Error("Operation cancelled");

				const precommitPath = path.join(absoluteTarget, ".husky", "pre-commit");
				await fsp.writeFile(precommitPath, "npx biome check --write .\ngit add -A\nnpx tsc --noEmit\n");
				created.push(".husky/pre-commit");
			} catch (e) {
				skipped.push(`.husky/pre-commit (failed: ${(e as Error).message})`);
			}
		}
	}

	// Save manifest tracking the package.json and biome.json
	const trackedFiles = new Map<string, string>();
	if (existsSync(pkgPath)) trackedFiles.set("package.json", hashFile(pkgPath));
	if (existsSync(biomePath)) trackedFiles.set("biome.json", hashFile(biomePath));
	const tsconfigExists = await fsp.access(tsconfigPath).then(() => true).catch(() => false);
	if (tsconfigExists) trackedFiles.set("tsconfig.json", hashFile(tsconfigPath));

	const manifest = buildManifest(trackedFiles, version, "retrofit");
	saveManifest(absoluteTarget, manifest);

	return {
		targetDir: absoluteTarget,
		filesCreated: created,
		filesUpdated: updated,
		filesSkipped: skipped,
		conflicts,
		backupDir: null,
		isUpdate,
		operation: "retrofit",
		durationMs: Date.now() - startTime,
	};
}
