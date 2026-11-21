import { describe, it, expect } from "vitest";
import { DEFAULT_EDITOR_SETTINGS, mergeEditorSettings } from "../src/settings/editorSettings";

describe("EditorSettings LSP defaults", () => {
  it("defaults LSP to in-browser worker mode", () => {
    expect(DEFAULT_EDITOR_SETTINGS.lspMode).toBe("worker");
    expect(DEFAULT_EDITOR_SETTINGS.lspRemoteUrl).toMatch(/^ws:\/\//);
  });

  it("fills missing LSP fields from defaults when merging stored settings", () => {
    const merged = mergeEditorSettings({ darkMode: false });
    expect(merged.lspMode).toBe("worker");
    expect(merged.lspRemoteUrl).toBe(DEFAULT_EDITOR_SETTINGS.lspRemoteUrl);
  });

  it("keeps stored LSP fields", () => {
    const merged = mergeEditorSettings({ lspMode: "remote", lspRemoteUrl: "ws://example:9000" });
    expect(merged.lspMode).toBe("remote");
    expect(merged.lspRemoteUrl).toBe("ws://example:9000");
  });
});
