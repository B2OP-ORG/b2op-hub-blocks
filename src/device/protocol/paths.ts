// ── Path validation (unchanged) ───────────────────────────────────────────────

const FORBIDDEN = new Set(["/main.py", "/boot.py", "/boot.mpy", "/runner.py"]);

export class UploadError extends Error {}

export interface UploadPolicy { allowRoot: boolean; }

export function validatePath(path: string, policy: UploadPolicy): void {
  if (FORBIDDEN.has(path)) throw new UploadError(`Forbidden path: ${path}`);
  if (path.startsWith("/sd/")) return;
  if (policy.allowRoot && path.startsWith("/") && !path.startsWith("//")) return;
  throw new UploadError(`Path must be under /sd/ (allowRoot=${policy.allowRoot}): ${path}`);
}
