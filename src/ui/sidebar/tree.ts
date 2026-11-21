import { baseName, type ProjectFile } from "../../project/format";
import { relDirname } from "../../project/paths";

export interface DirNode { kind: "dir"; path: string; name: string; children: TreeNode[] }
export interface FileNode { kind: "file"; file: ProjectFile; name: string }
export type TreeNode = DirNode | FileNode;

/** Project files + (empty) folders as a sorted tree: folders first, natural name order. */
export function buildTree(files: ProjectFile[], folders: string[]): TreeNode[] {
  const root: DirNode = { kind: "dir", path: "", name: "", children: [] };
  const dirs = new Map<string, DirNode>([["", root]]);
  const ensureDir = (path: string): DirNode => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const parent = ensureDir(relDirname(path));
    const node: DirNode = { kind: "dir", path, name: baseName(path), children: [] };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const d of folders) ensureDir(d);
  for (const f of files) ensureDir(relDirname(f.name)).children.push({ kind: "file", file: f, name: baseName(f.name) });
  const sort = (n: DirNode) => {
    n.children.sort((a, b) => (a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true })));
    n.children.forEach((c) => c.kind === "dir" && sort(c));
  };
  sort(root);
  return root.children;
}
