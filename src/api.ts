/**
 * Programmatic API for pi-extension-toolkit.
 *
 * Can be imported directly by agents/scripts:
 *   import { createExtensionApi, retrofitApi, verifyApi, verifyRules } from 'pi-extension-toolkit/api';
 */
import * as path from "node:path";
import { createExtension } from "./core.js";
import type { DryRunResult, ToolkitOptions, ToolkitResult } from "./lib/types.js";
import {
	computeChanges,
	getInstalledVersion,
	hashFile,
	isToolkitInstalled,
	loadManifest,
	walkDir,
} from "./lib/updater.js";
import { retrofitExtension } from "./retrofit.js";
import { type VerifyResult, formatText, verifyRules } from "./verify.js";

export type {
	DryRunResult,
	FileChange,
	ManifestEntry,
	ToolkitManifest,
	ToolkitOptions,
	ToolkitResult,
} from "./lib/types.js";

export type { VerifyResult } from "./verify.js";

export {
	computeChanges,
	getInstalledVersion,
	hashFile,
	isToolkitInstalled,
	loadManifest,
	walkDir,
} from "./lib/updater.js";

export { formatText, verifyRules } from "./verify.js";

const TEMPLATE_DIR = path.resolve(import.meta.dirname, "..", "template");

/** Options for createExtension via API */
export interface CreateApiOptions extends ToolkitOptions {
	name: string;
	signal?: AbortSignal;
	onUpdate?: (msg: string) => void;
}

/** Options for retrofitExtension via API */
export interface RetrofitApiOptions extends ToolkitOptions {
	signal?: AbortSignal;
	onUpdate?: (msg: string) => void;
}

/**
 * Create a new Pi extension or safely update an existing one.
 *
 * If the target already has toolkit files (detected via `.pi-extension-toolkit-manifest.json`),
 * uses safe update logic to preserve user modifications. User-modified files are skipped
 * unless `force: true` is set, in which case they show as conflicts.
 *
 * @param options - Creation options including name, targetDir, and control flags
 * @returns Structured result with file lists and conflict info
 *
 * @example
 * ```typescript
 * import { createExtensionApi } from 'pi-extension-toolkit/api';
 *
 * // New project
 * const result = await createExtensionApi({ name: 'pi-my-tool', targetDir: './my-tool' });
 * console.log(`Created ${result.filesCreated.length} files`);
 *
 * // Safe update (dry-run first)
 * const preview = await createExtensionApi({ name: 'pi-my-tool', targetDir: './my-tool', dryRun: true });
 * ```
 */
export async function createExtensionApi(options: CreateApiOptions): Promise<ToolkitResult> {
	return createExtension(TEMPLATE_DIR, {
		name: options.name,
		targetDir: options.targetDir,
		signal: options.signal,
		onUpdate: options.onUpdate,
		dryRun: options.dryRun,
		force: options.force,
		backup: options.backup ?? true,
	});
}

/**
 * Retrofit an existing Pi extension to current template standards.
 *
 * Uses safe update logic: if the target has a toolkit manifest, only applies
 * patches that haven't been user-modified. Reports conflicts for files that
 * can't be safely updated.
 *
 * @param options - Retrofit options including targetDir and control flags
 * @returns Structured result with change lists
 *
 * @example
 * ```typescript
 * import { retrofitApi } from 'pi-extension-toolkit/api';
 *
 * // Preview first
 * const preview = await retrofitApi({ targetDir: './my-legacy-extension', dryRun: true });
 *
 * // Apply
 * const result = await retrofitApi({ targetDir: './my-legacy-extension' });
 * ```
 */
export async function retrofitApi(options: RetrofitApiOptions): Promise<ToolkitResult> {
	return retrofitExtension({
		targetDir: options.targetDir,
		signal: options.signal,
		onUpdate: options.onUpdate,
		dryRun: options.dryRun,
		force: options.force,
		backup: options.backup ?? true,
	});
}

/**
 * Verify a Pi extension against template standards.
 *
 * @param targetDir - Directory of the extension to verify
 * @returns Structured result with errors and warnings grouped by severity
 *
 * @example
 * ```typescript
 * import { verifyApi, verifyRules } from 'pi-extension-toolkit/api';
 *
 * // Structured result
 * const result = await verifyApi('./my-extension');
 * if (result.passed) {
 *   console.log('All checks passed!');
 * } else {
 *   for (const issue of result.errors) console.error(issue.message);
 *   for (const issue of result.warnings) console.warn(issue.message);
 * }
 *
 * // Or get the raw rules for custom display
 * const rules = await verifyRules('./my-extension');
 * ```
 */
export async function verifyApi(targetDir: string): Promise<VerifyResult> {
	return verifyRules(targetDir);
}

/**
 * Check an extension and return a human-friendly status.
 *
 * @param targetDir - Directory to check
 * @returns Status object with installed version info
 */
export async function checkStatus(targetDir: string): Promise<{
	installed: boolean;
	version: string | null;
	hasConflicts: boolean;
	lastOperation: "create" | "retrofit" | null;
}> {
	const installed = isToolkitInstalled(targetDir);
	const version = getInstalledVersion(targetDir);
	const manifest = loadManifest(targetDir);

	return {
		installed,
		version,
		hasConflicts: false,
		lastOperation: manifest?.operation ?? null,
	};
}
