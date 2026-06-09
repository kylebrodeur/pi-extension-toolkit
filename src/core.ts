import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

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

export interface CreateExtensionOptions {
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Progress callback for streaming status updates */
	onUpdate?: (msg: string) => void;
}

export async function createExtension(
	name: string,
	targetDir: string,
	templateDir: string,
	options: CreateExtensionOptions = {},
): Promise<string> {
	const { signal, onUpdate } = options;

	if (signal?.aborted) throw new Error("Operation cancelled");

	const absoluteTarget = path.resolve(targetDir);
	const absoluteTemplate = path.resolve(templateDir);

	try {
		await fs.access(absoluteTarget);
		const files = await fs.readdir(absoluteTarget);
		if (files.length > 0) {
			throw new Error(`Target directory ${absoluteTarget} is not empty.`);
		}
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") {
			await fs.mkdir(absoluteTarget, { recursive: true });
		} else {
			throw e;
		}
	}

	// Helper to copy directory recursively
	async function copyDir(src: string, dest: string) {
		if (signal?.aborted) throw new Error("Operation cancelled");
		await fs.mkdir(dest, { recursive: true });
		const entries = await fs.readdir(src, { withFileTypes: true });
		for (const entry of entries) {
			if (signal?.aborted) throw new Error("Operation cancelled");
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;

			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);
			if (entry.isDirectory()) {
				await copyDir(srcPath, destPath);
			} else {
				await fs.copyFile(srcPath, destPath);
			}
		}
	}

	onUpdate?.("Copying template files...");
	await copyDir(absoluteTemplate, absoluteTarget);

	// Update package.json
	const packageJsonPath = path.join(absoluteTarget, "package.json");
	const packageJsonStr = await fs.readFile(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(packageJsonStr);
	packageJson.name = name;
	packageJson.version = "0.1.0";
	await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

	// Initialize git and run install
	onUpdate?.("Initializing git repository...");
	const gitResult = await execWithSignal("git", ["init"], { cwd: absoluteTarget, signal });
	if (gitResult.code !== 0) {
		return `Extension files created, but git init failed: ${gitResult.stderr}`;
	}

	onUpdate?.("Installing npm dependencies...");
	const npmResult = await execWithSignal("npm", ["install"], { cwd: absoluteTarget, signal });
	if (npmResult.killed) throw new Error("Operation cancelled");
	if (npmResult.code !== 0) {
		return `Extension files created, but npm install failed: ${npmResult.stderr}`;
	}

	return `Successfully created extension ${name} in ${absoluteTarget}`;
}
