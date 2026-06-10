import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function verifyStandards(targetDir: string): Promise<string> {
	const absoluteTarget = path.resolve(targetDir);
	const errors: string[] = [];
	const log = (msg: string) => errors.push(msg);

	// 1. package.json
	const pkgPath = path.join(absoluteTarget, "package.json");
	let pkg: Record<string, unknown> | undefined;
	try {
		pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as Record<string, unknown>;
	} catch (e) {
		log("❌ Could not read package.json. Is this a Pi extension directory?");
		return errors.join("\n");
	}

	if (!pkg.exports) log("❌ Missing 'exports' in package.json");
	if (!Array.isArray(pkg.files) || !pkg.files.includes("dist"))
		log("❌ Missing 'dist' in 'files' array in package.json");
	if (Array.isArray(pkg.files) && !pkg.files.includes("CHANGELOG.md"))
		log("⚠️ Missing 'CHANGELOG.md' in 'files' array");
	if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes("pi-package"))
		log("❌ Missing 'pi-package' in 'keywords' array");
	if (!(pkg.pi as Record<string, string[]>)?.extensions?.includes("./dist"))
		log("❌ Missing './dist' in 'pi.extensions' array");
	if (pkg.type !== "module") log("❌ 'type' is not 'module' in package.json");
	if (pkg.scripts && (pkg.scripts as Record<string, string>).prepare !== "husky")
		log("❌ 'prepare' script is not 'husky'");

	const deps = (pkg.dependencies as Record<string, string>) || {};
	const devDeps = (pkg.devDependencies as Record<string, string>) || {};

	if (deps["@sinclair/typebox"] || deps.typebox)
		log("❌ typebox should be in devDependencies, not dependencies");
	if (!devDeps.typebox)
		log("❌ Missing 'typebox' in devDependencies (must be ^1.x for Pi >=0.70.2)");
	if (!devDeps["@earendil-works/pi-coding-agent"])
		log("❌ Missing '@earendil-works/pi-coding-agent' in devDependencies");

	// Template metadata fields
	if (!pkg.license) log("⚠️ Missing 'license' in package.json (recommended: MIT)");
	const engines = pkg.engines as Record<string, string> | undefined;
	if (!engines?.node) log("⚠️ Missing 'engines.node' in package.json (recommended: >=22.0.0)");
	if (!pkg.repository) log("⚠️ Missing 'repository' in package.json");
	if (!pkg.bugs) log("⚠️ Missing 'bugs' in package.json");
	if (!pkg.homepage) log("⚠️ Missing 'homepage' in package.json");

	const peerDeps = (pkg.peerDependencies as Record<string, string>) || {};
	if (!peerDeps["@earendil-works/pi-coding-agent"])
		log("⚠️ Missing '@earendil-works/pi-coding-agent' in peerDependencies");

	// 2. biome.json
	const biomePath = path.join(absoluteTarget, "biome.json");
	try {
		const biome = JSON.parse(await fs.readFile(biomePath, "utf-8"));
		if (biome.$schema !== "https://biomejs.dev/schemas/latest/schema.json") {
			log("❌ biome.json $schema is not 'https://biomejs.dev/schemas/latest/schema.json'");
		}
	} catch (e) {
		log("❌ Could not read biome.json or invalid JSON");
	}

	// 3. tsconfig.json
	const tsconfigPath = path.join(absoluteTarget, "tsconfig.json");
	try {
		const tsconfigStr = await fs.readFile(tsconfigPath, "utf-8");
		if (
			/"module"\s*:\s*"CommonJS"/.test(tsconfigStr) ||
			/"module"\s*:\s*"Node"/.test(tsconfigStr)
		) {
			log("❌ tsconfig.json module should be 'NodeNext', not 'CommonJS' or 'Node'");
		}
		if (/"moduleResolution"\s*:\s*"Node"/.test(tsconfigStr)) {
			log("❌ tsconfig.json moduleResolution should be 'NodeNext', not 'Node'");
		}
		if (/"target"\s*:\s*"ES2022"/.test(tsconfigStr)) {
			log("❌ tsconfig.json target should be 'ESNext'");
		}
	} catch (e) {
		log("❌ Could not read tsconfig.json");
	}

	// 4. Husky setup
	const precommitPath = path.join(absoluteTarget, ".husky", "pre-commit");
	try {
		const precommit = await fs.readFile(precommitPath, "utf-8");
		if (!precommit.includes("biome check --write"))
			log("❌ Husky pre-commit hook missing 'biome check --write'");
		if (!precommit.includes("git add -A")) log("❌ Husky pre-commit hook missing 'git add -A'");
		if (!precommit.includes("tsc --noEmit")) log("❌ Husky pre-commit hook missing 'tsc --noEmit'");
	} catch (e) {
		log("❌ Could not read .husky/pre-commit. Husky v9 might not be configured.");
	}

	// 5. GitHub Actions
	const workflowPath = path.join(absoluteTarget, ".github", "workflows", "release.yml");
	try {
		const workflow = await fs.readFile(workflowPath, "utf-8");
		if (workflow.includes('node-version: "20"'))
			log("❌ .github/workflows/release.yml uses node-version: 20 (EOL soon), should be 22");
		if (workflow.includes('registry-url: "https://npmjs.org"'))
			log(
				'❌ .github/workflows/release.yml registry-url should be "https://registry.npmjs.org" for provenance'
			);
		if (!workflow.includes("--provenance"))
			log("❌ npm publish missing --provenance flag in release.yml");
	} catch (e) {
		log("⚠️ Could not read .github/workflows/release.yml (Optional, but recommended for CI)");
	}

	if (errors.length === 0) {
		return "✅ All checks passed! Extension follows the pi-extension-template standards.";
	}

	return `Verification found ${errors.length} issues:\n\n${errors.join("\n")}`;
}
