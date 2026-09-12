import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface LocalFileEntry {
  id: string;
  absolutePath: string;
  relativePath: string;
  size: number;
}

function walkDir(root: string, base: string, out: LocalFileEntry[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const abs = path.join(root, ent.name);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walkDir(abs, base, out);
      continue;
    }
    if (!st.isFile()) continue;
    const rel = path.relative(base, abs).split(path.sep).join('/');
    out.push({
      id: randomUUID(),
      absolutePath: abs,
      relativePath: rel,
      size: st.size,
    });
  }
}

export function collectPaths(inputPaths: string[]): LocalFileEntry[] {
  const out: LocalFileEntry[] = [];
  for (const p of inputPaths) {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walkDir(p, p, out);
    } else if (st.isFile()) {
      out.push({
        id: randomUUID(),
        absolutePath: p,
        relativePath: path.basename(p),
        size: st.size,
      });
    }
  }
  return out;
}

export function safeResolveDownloadPath(downloadDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..')) {
    throw new Error('invalid relative path');
  }
  const target = path.resolve(downloadDir, ...normalized.split('/'));
  const root = path.resolve(downloadDir);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error('path escapes download dir');
  }
  return target;
}
