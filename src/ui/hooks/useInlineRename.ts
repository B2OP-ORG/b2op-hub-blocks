import { useState } from "react";

/**
 * State for an inline rename (see components/InlineInput). `T` identifies the
 * item being renamed plus the draft `value`. `onCommit` gets the trimmed,
 * non-empty new name.
 */
export function useInlineRename<T extends { value: string }>(onCommit: (item: T, value: string) => void | Promise<void>) {
  const [renaming, setRenaming] = useState<T | null>(null);

  const commit = () => {
    const r = renaming;
    setRenaming(null);
    if (!r) return;
    const value = r.value.trim();
    if (!value) return;
    void onCommit(r, value);
  };

  return {
    renaming,
    start: (item: T) => setRenaming(item),
    /** Props for <InlineInput> while renaming. */
    inputProps: renaming && {
      value: renaming.value,
      onChange: (value: string) => setRenaming({ ...renaming, value }),
      onCommit: commit,
      onCancel: () => setRenaming(null),
    },
  };
}
