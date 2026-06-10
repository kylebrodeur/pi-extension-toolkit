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
import type { DryRunResult, ToolkitOptions, ToolkitResult } from "./lib/types.js";

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

export interface CreateExtensionOptions extends ToolkitOptions {
	/** Package name for the new extension */
	name: string;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Progress callback for streaming status updates */
	onUpdate?: (msg: string) => void;
}

/**
 * Create a new Pi extension from the template, or safely update an existing one.
 *
 * If the target already has toolkit files (detected via manifest), uses safe update
 * logic to preserve user modifications. New directories get a full scaffold.
 *
 * @returns Structured result with file lists and conflict info.
 */
export async function createExtension(
	templateDir: string,
	options: CreateExtensionOptions,
): Promise<ToolkitResult> {
	const startTime = Date.now();
	const { name, targetDir, signal, onUpdate, force = false, backup = true, dryRun = false } = options;

	if (signal?.aborted) throw new Error("Operation cancelled");

	const absoluteTarget = path.resolve(targetDir);
	const absoluteTemplate = path.resolve(templateDir);
	const version = getPackageVersion();
	const isUpdate = isToolkitInstalled(absoluteTarget);

	// Ensure target directory exists
	try {
		await fsp.access(absoluteTarget);
		const files = await fsp.readdir(absoluteTarget);
		if (!isUpdate && files.length > 0) {
			throw new Error(`Target directory ${absoluteTarget} is not empty. Use force:true to overwrite.`);
		}
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") {
			await fsp.mkdir(absoluteTarget, { recursive: true });
		} else {
			throw e;
		}
	}

	// Build map of source files (template) with their hashes
	const sourceFiles = new Map<string, string>();
	const templateFiles = walkDir(absoluteTemplate);
	for (const relPath of templateFiles) {
		const fullPath = path.join(absoluteTemplate, relPath);
		sourceFiles.set(relPath, hashFile(fullPath));
	}

	// Copy template to target, customizing package.json
	async function copyTemplate(): Promise<string[]> {
		const created: string[] = [];
		async function copyDir(src: string, dest: string) {
			if (signal?.aborted) throw new Error("Operation cancelled");
			await fsp.mkdir(dest, { recursive: true });
			const entries = await fsp.readdir(src, { withFileTypes: true });
			for (const entry of entries) {
				if (signal?.aborted) throw new Error("Operation cancelled");
				if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;

				const srcPath = path.join(src, entry.name);
				const destPath = path.join(dest, entry.name);
				if (entry.isDirectory()) {
					await copyDir(srcPath, destPath);
				} else {
					if (entry.name === "package.json") {
						const pkgStr = await fsp.readFile(srcPath, "utf-8");
						const pkg = JSON.parse(pkgStr);
						pkg.name = name;
						pkg.version = "0.1.0";
						await fsp.writeFile(destPath, `${JSON.stringify(pkg, null, 2)}\n`);
					} else {
						await fsp.copyFile(srcPath, destPath);
					}
					created.push(entry.name);
				}
			}
		}
		await copyDir(absoluteTemplate, absoluteTarget);
		return created;
	}

	// Compute changes
	const changes = computeChanges(absoluteTarget, sourceFiles, "create", force);

	if (dryRun) {
		const dryRunResult: DryRunResult = {
			wouldExecute: true,
			operation: "create",
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
			operation: "create",
			durationMs: Date.now() - startTime,
		};
	}

	// Apply changes (or do fresh copy for new installs)
	let created: string[] = [];
	let updated: string[] = [];
	let skipped: string[] = [];
	let conflicts: string[] = [];
	let backupDir: string | null = null;

	if (isUpdate) {
		const result = applyChanges(absoluteTarget, absoluteTemplate, sourceFiles, changes, backup);
		created = result.created;
		updated = result.updated;
		skipped = result.skipped;
		conflicts = result.conflicts;
		backupDir = result.backupDir;
	} else {
		onUpdate?.("Copying template files...");
		created = await copyTemplate();
	}

	// Rebuild sourceFiles with updated package.json for manifest
	const finalSourceFiles = new Map<string, string>();
	for (const relPath of templateFiles) {
		const targetFilePath = path.join(absoluteTarget, relPath);
		if (existsSync(targetFilePath)) {
			finalSourceFiles.set(relPath, hashFile(targetFilePath));
		}
	}

	// Save manifest
	const manifest = buildManifest(finalSourceFiles, version, "create");
	saveManifest(absoluteTarget, manifest);

	// Run git init and npm install
	if (!isUpdate || force) {
		onUpdate?.("Initializing git repository...");
		const gitResult = await execWithSignal("git", ["init"], { cwd: absoluteTarget, signal });
		if (gitResult.killed) throw new Error("Operation cancelled");

		onUpdate?.("Installing npm dependencies...");
		const npmResult = await execWithSignal("npm", ["install"], { cwd: absoluteTarget, signal });
		if (npmResult.killed) throw new Error("Operation cancelled");
	}

	return {
		targetDir: absoluteTarget,
		filesCreated: created,
		filesUpdated: updated,
		filesSkipped: skipped,
		conflicts,
		backupDir,
		isUpdate,
		operation: "create",
		durationMs: Date.now() - startTime,
	};
}
