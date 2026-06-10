import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createExtension } from "./dist/core.js";
import { retrofitExtension } from "./dist/retrofit.js";
import { verifyStandards } from "./dist/verify.js";
import { isToolkitInstalled, getInstalledVersion } from "./dist/lib/updater.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, "template");
const TARGET_DIR = path.resolve(__dirname, "..", "..", "tmp", "pi-test-ext");

async function run() {
	console.log("Cleaning up target dir...");
	await fs.rm(TARGET_DIR, { recursive: true, force: true });

	console.log("\n--- Testing createExtension (new project) ---");
	const createResult = await createExtension(TEMPLATE_DIR, {
		name: "pi-test-ext",
		targetDir: TARGET_DIR,
		force: false,
		backup: true,
	});
	console.log(`Created: ${createResult.filesCreated.length} files`);
	console.log(`Is update: ${createResult.isUpdate}`);
	console.log(`Duration: ${createResult.durationMs}ms`);

	// Verify manifest was created
	console.log(`\nManifest exists: ${isToolkitInstalled(TARGET_DIR)}`);
	console.log(`Version: ${getInstalledVersion(TARGET_DIR)}`);

	console.log("\n--- Testing verifyStandards (Initial) ---");
	const verify1 = await verifyStandards(TARGET_DIR);
	console.log(verify1);
	if (!verify1.includes("✅")) throw new Error("Initial verify failed!");

	console.log("\n--- Testing retrofitExtension (Initial) ---");
	const retrofit1 = await retrofitExtension({
		targetDir: TARGET_DIR,
		force: false,
		backup: true,
	});
	console.log(`Updated: ${retrofit1.filesUpdated.length}, Created: ${retrofit1.filesCreated.length}`);

	console.log("\n--- Testing dry-run create (should detect existing, show safe update) ---");
	const dryRun = await createExtension(TEMPLATE_DIR, {
		name: "pi-test-ext",
		targetDir: TARGET_DIR,
		dryRun: true,
	});
	console.log(`Dry-run: ${dryRun.filesSkipped.length} skipped, ${dryRun.filesCreated.length} created`);

	console.log("\n--- Sabotaging extension ---");
	const pkgPath = path.join(TARGET_DIR, "package.json");
	const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
	pkg.type = "commonjs";
	pkg.exports = undefined;
	pkg.devDependencies.typebox = undefined;
	pkg.dependencies = { "@sinclair/typebox": "0.34.0" };
	await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

	const biomePath = path.join(TARGET_DIR, "biome.json");
	const biome = JSON.parse(await fs.readFile(biomePath, "utf-8"));
	biome.$schema = "https://biomejs.dev";
	await fs.writeFile(biomePath, JSON.stringify(biome, null, 2));
	console.log("Sabotage complete.");

	console.log("\n--- Testing verifyStandards (Sabotaged) ---");
	const verify2 = await verifyStandards(TARGET_DIR);
	console.log(verify2);
	if (verify2.includes("✅")) throw new Error("Sabotaged verify should not pass!");

	console.log("\n--- Testing retrofitExtension (Recovery) ---");
	const retrofit2 = await retrofitExtension({
		targetDir: TARGET_DIR,
		force: false,
		backup: true,
	});
	console.log(`Updated: ${retrofit2.filesUpdated.length}, Created: ${retrofit2.filesCreated.length}`);

	console.log("\n--- Testing verifyStandards (Recovered) ---");
	const verify3 = await verifyStandards(TARGET_DIR);
	console.log(verify3);
	if (!verify3.includes("✅")) throw new Error("Recovered verify failed!");

	console.log("\nAll tests passed successfully!");
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
