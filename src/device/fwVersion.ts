export function parseSemver(v: string): [number, number, number] {
  const parts = v.replace(/^v/, "").split(".");
  return [Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0];
}

export function isNewer(latest: string, current: string): boolean {
  const [lM, lm, lp] = parseSemver(latest);
  const [cM, cm, cp] = parseSemver(current);
  return lM > cM || (lM === cM && lm > cm) || (lM === cM && lm === cm && lp > cp);
}

/** Dev builds (dirty, git-hash suffix) are never prompted for update. */
export function isDevBuild(fwVersion: string): boolean {
  return fwVersion.includes("dirty") || fwVersion.includes("+");
}
