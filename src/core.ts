import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createExtension(
	name: string,
	targetDir: string,
	templateDir: string
): Promise<string> {
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
		await fs.mkdir(dest, { recursive: true });
		const entries = await fs.readdir(src, { withFileTypes: true });
		for (const entry of entries) {
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

	await copyDir(absoluteTemplate, absoluteTarget);

	// Update package.json
	const packageJsonPath = path.join(absoluteTarget, "package.json");
	const packageJsonStr = await fs.readFile(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(packageJsonStr);
	packageJson.name = name;
	packageJson.version = "0.1.0";
	await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

	// Initialize git and run install
	try {
		await execFileAsync("git", ["init"], { cwd: absoluteTarget });
		await execFileAsync("npm", ["install"], { cwd: absoluteTarget });
	} catch (e) {
		return `Extension files created, but post-creation scripts failed: ${(e as Error).message}`;
	}

	return `Successfully created extension ${name} in ${absoluteTarget}`;
}
