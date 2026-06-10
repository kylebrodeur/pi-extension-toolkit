/**
 * Shared type definitions for pi-extension-toolkit.
 */

/** Record of a file tracked in the manifest */
export interface ManifestEntry {
	/** Relative path from the target directory */
	path: string;
	/** SHA-256 hash of the original content as installed */
	hash: string;
}

/** Manifest stored at project root after toolkit operations */
export interface ToolkitManifest {
	version: string;
	installedAt: string;
	operation: "create" | "retrofit";
	files: ManifestEntry[];
}

/** Individual file change computed during safe update */
export interface FileChange {
	relativePath: string;
	action: "created" | "updated" | "skipped" | "conflict" | "unchanged";
	reason?: string;
}

/** Options for safe update/create/retrofit operations */
export interface ToolkitOptions {
	targetDir: string;
	/** Overwrite user-modified files (default: false) */
	force?: boolean;
	/** Create backup of files before overwriting (default: true) */
	backup?: boolean;
	/** Preview changes without executing (default: false) */
	dryRun?: boolean;
}

/** Result of create/retrofit operations */
export interface ToolkitResult {
	targetDir: string;
	filesCreated: string[];
	filesUpdated: string[];
	filesSkipped: string[];
	conflicts: string[];
	backupDir: string | null;
	isUpdate: boolean;
	operation: "create" | "retrofit";
	durationMs: number;
}

/** Dry-run preview result */
export interface DryRunResult {
	wouldExecute: boolean;
	operation: "create" | "retrofit";
	changes: FileChange[];
	summary: {
		filesCreated: string[];
		filesUpdated: string[];
		filesSkipped: string[];
		filesWithConflicts: string[];
	};
}

/** Result of verify operation */
export interface VerifyResult {
	targetDir: string;
	passed: boolean;
	issues: string[];
	durationMs: number;
}
