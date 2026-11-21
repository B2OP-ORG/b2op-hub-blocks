// Human-readable sizes, speeds and durations (transfer progress).

/** Byte count as B / kB / MB (1024-based), e.g. 512 B, 12.3 kB, 1.25 MB. */
export function fmtBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${Math.round(n)} B`;
}

export function fmtSpeed(bps: number): string {
  return `${fmtBytes(bps)}/s`;
}

export function fmtEta(sec: number): string {
  if (sec < 60) return `~${Math.ceil(sec)}s`;
  return `~${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`;
}
