/**
 * Semantic exit codes for pi-extension-toolkit operations.
 * Allows scripts and agents to programmatically determine failure reasons.
 */
export const ExitCode = {
	/** Success */
	OK: 0,

	/** General/unknown error */
	ERROR: 1,

	/** Invalid command-line arguments or usage */
	INVALID_ARGS: 2,

	/** Target not found (ENOENT) */
	NOT_FOUND: 3,

	/** Permission denied (EACCES) */
	PERMISSION_DENIED: 4,

	/** File/directory already exists (EEXIST) - use force:true to override */
	ALREADY_EXISTS: 5,

	/** Git/submodule operation failed */
	GIT_ERROR: 6,

	/** Network/fetch operation failed */
	NETWORK_ERROR: 7,

	/** Validation failed (schema, input, config) */
	VALIDATION_ERROR: 8,

	/** Cancelled by user (SIGINT) */
	CANCELLED: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Maps Node.js errno to semantic exit code.
 */
export function mapErrnoToExitCode(errno: string | undefined): ExitCode {
	switch (errno) {
		case "ENOENT":
			return ExitCode.NOT_FOUND;
		case "EACCES":
		case "EPERM":
			return ExitCode.PERMISSION_DENIED;
		case "EEXIST":
			return ExitCode.ALREADY_EXISTS;
		default:
			return ExitCode.ERROR;
	}
}
