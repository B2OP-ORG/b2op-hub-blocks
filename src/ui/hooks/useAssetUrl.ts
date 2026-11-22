import { useEffect, useState } from "react";
import { assetUrl } from "../../project/assets";
import type { AssetRef } from "../../project/format";

/**
 * Object URL of an asset: undefined while loading, null when its bytes are
 * missing (or there is no asset).
 */
export function useAssetUrl(asset: AssetRef | undefined): string | null | undefined {
  const hash = asset?.hash, type = asset?.type ?? "application/octet-stream";
  const [state, setState] = useState<{ hash?: string; url: string | null | undefined }>({ url: undefined });
  useEffect(() => {
    if (!hash) return;
    let live = true;
    assetUrl(hash, type).then((u) => { if (live) setState({ hash, url: u ?? null }); }, () => { if (live) setState({ hash, url: null }); });
    return () => { live = false; };
  }, [hash, type]);
  if (!hash) return null;
  return state.hash === hash ? state.url : undefined;
}
