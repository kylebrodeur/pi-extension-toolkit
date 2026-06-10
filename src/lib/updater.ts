/**
 * Safe update engine for pi-extension-toolkit.
 *
 * Tracks files via a manifest with SHA-256 hashes so that re-running
 * create_extension or retrofit_extension can detect user modifications
 * and safely skip or report conflicts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FileChange, ManifestEntry, ToolkitManifest } from "./types.js";

/** Manifest filename stored at the target directory root */
const MANIFEST_FILENAME = ".pi-extension-toolkit-manifest.json";

/** Backup directory prefix */
const BACKUP_PREFIX = ".pi-toolkit-backup";

/** Hash a file's content with SHA-256 */
export function hashFile(filePath: string): string {
	const content = fs.readFileSync(filePath);
	return crypto.createHash("sha256").update(content).digest("hex");
}

/** Walk a directory recursively, returning relative paths */
export function walkDir(dir: string): string[] {
	const result: string[] = [];
	if (!fs.existsSync(dir)) return result;

	const entries = fs.readdirSync(dir);
	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		const stat = fs.statSync(fullPath);
		if (stat.isDirectory()) {
			const subPaths = walkDir(fullPath);
			for (const sub of subPaths) {
				result.push(path.join(entry, sub));
			}
		} else {
			result.push(entry);
		}
	}
	return result;
}

/** Get the manifest file path for a target directory */
function getManifestPath(targetDir: string): string {
	return path.join(targetDir, MANIFEST_FILENAME);
}

/** Load existing manifest if present */
export function loadManifest(targetDir: string): ToolkitManifest | null {
	const manifestPath = getManifestPath(targetDir);
	if (!fs.existsSync(manifestPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
	} catch {
		return null;
	}
}

/** Save manifest to target directory */
export function saveManifest(targetDir: string, manifest: ToolkitManifest): void {
	const manifestPath = getManifestPath(targetDir);
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

/** Check if a directory has a pi-extension-toolkit installation */
export function isToolkitInstalled(targetDir: string): boolean {
	return fs.existsSync(getManifestPath(targetDir));
}

/** Get installed version, or null */
export function getInstalledVersion(targetDir: string): string | null {
	const manifest = loadManifest(targetDir);
	return manifest?.version ?? null;
}

/** Create a backup of target files before overwriting */
export function createBackup(targetDir: string, files: string[]): string | null {
	if (files.length === 0) return null;

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupDir = path.join(targetDir, `${BACKUP_PREFIX}-${timestamp}`);

	for (const file of files) {
		const srcPath = path.join(targetDir, file);
		const destPath = path.join(backupDir, file);

		if (fs.existsSync(srcPath)) {
			fs.mkdirSync(path.dirname(destPath), { recursive: true });
			fs.copyFileSync(srcPath, destPath);
		}
	}

	return backupDir;
}

/**
 * Compute file changes between current state and expected source state.
 *
 * Modes:
 * - `"create"`: Compares template files against target (all files are new or skipped)
 * - `"retrofit"`: Compares existing files against known manifest hashes
 */
export function computeChanges(
	targetDir: string,
	sourceFiles: Map<string, string>, // relativePath -> sourceHash
	operation: "create" | "retrofit",
	force: boolean,
): FileChange[] {
	const existingManifest = loadManifest(targetDir);
	const changes: FileChange[] = [];

	// Build lookup of known files from manifest
	const knownFiles = new Map<string, string>();
	if (existingManifest) {
		for (const entry of existingManifest.files) {
			knownFiles.set(entry.path, entry.hash);
		}
	}

	// Process each source file
	for (const [relativePath, sourceHash] of sourceFiles) {
		const targetPath = path.join(targetDir, relativePath);

		if (!fs.existsSync(targetPath)) {
			changes.push({
				relativePath,
				action: "created",
				reason: "New file",
			});
			continue;
		}

		const targetHash = hashFile(targetPath);

		if (sourceHash === targetHash) {
			changes.push({
				relativePath,
				action: "unchanged",
				reason: "Content identical to source",
			});
		} else if (knownFiles.has(relativePath)) {
			const manifestHash = knownFiles.get(relativePath) as string;
			if (targetHash === manifestHash) {
				// Same as original from manifest, safe to update
				changes.push({
					relativePath,
					action: "updated",
					reason: `Safe update (${operation}: no user modification)`,
				});
			} else if (force) {
				changes.push({
					relativePath,
					action: "updated",
					reason: "Force update (overwriting user modification)",
				});
			} else {
				changes.push({
					relativePath,
					action: "conflict",
					reason: "User modified; skipped. Use force:true to overwrite.",
				});
			}
		} else {
			// Not in manifest (pre-manifest install or manual add), but exists
			if (force) {
				changes.push({
					relativePath,
					action: "updated",
					reason: "Force update (file not tracked in manifest)",
				});
			} else {
				changes.push({
					relativePath,
					action: "skipped",
					reason: "File exists but not tracked; skipped. Use force:true to overwrite.",
				});
			}
		}
	}

	return changes;
}

/**
 * Apply file changes computed by computeChanges().
 * Returns lists of created, updated, skipped, and conflicted files.
 */
export function applyChanges(
	targetDir: string,
	sourceDir: string,
	sourceFiles: Map<string, string>,
	changes: FileChange[],
	backup: boolean,
): {
	created: string[];
	updated: string[];
	skipped: string[];
	conflicts: string[];
	backupDir: string | null;
} {
	const created: string[] = [];
	const updated: string[] = [];
	const skipped: string[] = [];
	const conflicts: string[] = [];

	// Determine which files will be overwritten (for backup)
	const filesToBackup = changes
		.filter((c) => c.action === "updated")
		.map((c) => c.relativePath);

	let backupDir: string | null = null;
	if (backup && filesToBackup.length > 0) {
		backupDir = createBackup(targetDir, filesToBackup);
	}

	// Apply changes
	for (const change of changes) {
		const sourcePath = path.join(sourceDir, change.relativePath);
		const targetPath = path.join(targetDir, change.relativePath);

		switch (change.action) {
			case "created":
				fs.mkdirSync(path.dirname(targetPath), { recursive: true });
				fs.copyFileSync(sourcePath, targetPath);
				created.push(change.relativePath);
				break;
			case "updated":
				fs.mkdirSync(path.dirname(targetPath), { recursive: true });
				fs.copyFileSync(sourcePath, targetPath);
				updated.push(change.relativePath);
				break;
			case "skipped":
				skipped.push(change.relativePath);
				break;
			case "conflict":
				conflicts.push(change.relativePath);
				break;
			// "unchanged" — do nothing
		}
	}

	return { created, updated, skipped, conflicts, backupDir };
}

/**
 * Build a manifest for all source files so future runs can detect user modifications.
 */
export function buildManifest(
	sourceFiles: Map<string, string>,
	version: string,
	operation: "create" | "retrofit",
): ToolkitManifest {
	const files: ManifestEntry[] = [];
	for (const [relativePath, hash] of sourceFiles) {
		files.push({ path: relativePath, hash });
	}

	return {
		version,
		installedAt: new Date().toISOString(),
		operation,
		files,
	};
}
