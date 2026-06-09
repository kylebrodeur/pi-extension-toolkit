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

export interface RetrofitOptions {
	signal?: AbortSignal;
	onUpdate?: (msg: string) => void;
}

export async function retrofitExtension(
	targetDir: string,
	options: RetrofitOptions = {},
): Promise<string> {
	const { signal, onUpdate } = options;
	const absoluteTarget = path.resolve(targetDir);
	const logs: string[] = [];
	const log = (msg: string) => logs.push(msg);

	if (signal?.aborted) throw new Error("Operation cancelled");

	// 1. package.json
	const pkgPath = path.join(absoluteTarget, "package.json");
	// biome-ignore lint/suspicious/noExplicitAny: parsed from JSON
	let pkg: any;
	try {
		pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
	} catch (e) {
		throw new Error("Could not read package.json. Are you in a Pi extension directory?");
	}

	let pkgChanged = false;
	if (!pkg.exports) {
		pkg.exports = {
			".": {
				import: "./dist/index.js",
				require: "./dist/index.js",
				types: "./dist/index.d.ts",
			},
		};
		pkgChanged = true;
		log("Added exports to package.json");
	}
	if (!pkg.files) {
		pkg.files = ["dist", "README.md"];
		pkgChanged = true;
		log("Added files array to package.json");
	}
	if (!pkg.keywords || !pkg.keywords.includes("pi-package")) {
		pkg.keywords = pkg.keywords || [];
		if (!pkg.keywords.includes("pi-package")) pkg.keywords.push("pi-package");
		pkgChanged = true;
		log("Added pi-package keyword to package.json");
	}
	if (!pkg.pi || !pkg.pi.extensions) {
		pkg.pi = pkg.pi || {};
		pkg.pi.extensions = ["./dist"];
		pkgChanged = true;
		log("Added pi.extensions array to package.json");
	}
	if (pkg.type !== "module") {
		pkg.type = "module";
		pkgChanged = true;
		log("Set type: module in package.json");
	}

	// Move typebox
	if (pkg.dependencies?.["@sinclair/typebox"] || pkg.dependencies?.typebox) {
		pkg.dependencies["@sinclair/typebox"] = undefined;
		pkg.dependencies.typebox = undefined;
		pkg.devDependencies = pkg.devDependencies || {};
		pkg.devDependencies.typebox = "^1.1.0";
		pkgChanged = true;
		log("Moved typebox to devDependencies and upgraded to ^1.1.0");
	}

	// Add @earendil-works/pi-coding-agent if missing
	if (!pkg.devDependencies?.["@earendil-works/pi-coding-agent"]) {
		pkg.devDependencies = pkg.devDependencies || {};
		pkg.devDependencies["@earendil-works/pi-coding-agent"] = "^0.79.0";
		pkgChanged = true;
		log("Added @earendil-works/pi-coding-agent to devDependencies");
	}

	// Husky prepare script
	if (pkg.scripts?.prepare !== "husky") {
		pkg.scripts = pkg.scripts || {};
		pkg.scripts.prepare = "husky";
		pkgChanged = true;
		log("Set prepare script to husky");
	}

	if (pkgChanged) {
		await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
	}

	// 2. biome.json
	const biomePath = path.join(absoluteTarget, "biome.json");
	try {
		const biome = JSON.parse(await fs.readFile(biomePath, "utf-8"));
		if (biome.$schema !== "https://biomejs.dev/schemas/latest/schema.json") {
			biome.$schema = "https://biomejs.dev/schemas/latest/schema.json";
			await fs.writeFile(biomePath, `${JSON.stringify(biome, null, 2)}\n`);
			log("Fixed biome.json schema URL");
		}
	} catch (e) {
		log("No biome.json found or invalid JSON. Skipping biome schema fix.");
	}

	// 3. tsconfig.json
	const tsconfigPath = path.join(absoluteTarget, "tsconfig.json");
	try {
		const tsconfigStr = await fs.readFile(tsconfigPath, "utf-8");
		let newTsconfig = tsconfigStr;
		newTsconfig = newTsconfig.replace(/"module"\s*:\s*"CommonJS"/, '"module": "NodeNext"');
		newTsconfig = newTsconfig.replace(
			/"moduleResolution"\s*:\s*"Node"/,
			'"moduleResolution": "NodeNext"',
		);
		newTsconfig = newTsconfig.replace(/"target"\s*:\s*"ES2022"/, '"target": "ESNext"');
		if (newTsconfig !== tsconfigStr) {
			await fs.writeFile(tsconfigPath, newTsconfig);
			log("Updated tsconfig.json module/target settings to NodeNext/ESNext");
		}
	} catch (e) {
		log("No tsconfig.json found. Skipping.");
	}

	// 4. Husky setup
	onUpdate?.("Installing Husky v9...");
	try {
		const installResult = await execWithSignal(
			"npm",
			["install", "--save-dev", "husky@^9.0.0"],
			{ cwd: absoluteTarget, signal },
		);
		if (installResult.killed) throw new Error("Operation cancelled");
		log("Installed Husky v9");

		const initResult = await execWithSignal("npx", ["husky", "init"], {
			cwd: absoluteTarget,
			signal,
		});
		if (initResult.killed) throw new Error("Operation cancelled");

		const precommitPath = path.join(absoluteTarget, ".husky", "pre-commit");
		await fs.writeFile(
			precommitPath,
			"npx biome check --write .\ngit add -A\nnpx tsc --noEmit\n",
		);
		log("Configured Husky pre-commit hook");
	} catch (e) {
		log(`Failed to setup Husky: ${(e as Error).message}`);
	}

	// 5. GitHub Actions
	const workflowPath = path.join(absoluteTarget, ".github", "workflows", "release.yml");
	try {
		let workflow = await fs.readFile(workflowPath, "utf-8");
		let wfChanged = false;
		if (workflow.includes('node-version: "20"')) {
			workflow = workflow.replace(/node-version: "20"/g, 'node-version: "22"');
			wfChanged = true;
		}
		if (workflow.includes('registry-url: "https://npmjs.org"')) {
			workflow = workflow.replace(
				/registry-url:\s*"https:\/\/npmjs\.org"/g,
				'registry-url: "https://registry.npmjs.org"',
			);
			wfChanged = true;
		}
		if (wfChanged) {
			await fs.writeFile(workflowPath, workflow);
			log("Updated .github/workflows/release.yml Node 22 and npmjs registry URL");
		}
	} catch (e) {
		log("No .github/workflows/release.yml found. Skipping.");
	}

	return logs.length > 0
		? `Retrofit complete:\n- ${logs.join("\n- ")}`
		: "No changes needed for retrofit.";
}
