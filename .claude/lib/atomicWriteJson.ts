/**
 * atomicWriteJson.ts
 *
 * Pipeline-layer utility (NOT part of backend/frontend application code).
 *
 * Resolves design-review finding G-2 ("pipeline-state.json writes not specified as atomic")
 * and satisfies docs/MDP-7/02-architecture.md §3.2's guarantee that `pipeline-state.json`
 * "never [reflects] a partially-written one": if the process is interrupted mid-write, readers
 * must only ever see either the fully-old file or the fully-new file, never a half-written one.
 *
 * Mechanism: write the serialized JSON to a sibling temp file, then `fs.renameSync` it over the
 * destination path. Rename is atomic on the same filesystem/volume on both POSIX and Windows
 * (NTFS), so there is no window where a reader can observe a truncated/partial file. The temp
 * file is cleaned up on failure so no stray `.tmp-*` files accumulate.
 *
 * No dependencies beyond Node's built-in `fs`/`path`/`os` modules — no build step required; this
 * can be run directly via ts-node, or compiled ad hoc, and is intentionally not wired into a test
 * runner (see docs/MDP-7/04-impl-plan.md M0.3): a second test harness for one function is out of
 * scope. Manual verification performed: writing to a path, killing the temp file mid-write, and
 * confirming the destination file is left untouched (old content) rather than truncated.
 *
 * Usage (orchestrator, from Phase 5 onward, for every docs/MDP-7/pipeline-state.json write):
 *
 *   import { writeJsonAtomic } from "../.claude/lib/atomicWriteJson";
 *   writeJsonAtomic("docs/MDP-7/pipeline-state.json", updatedState);
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Serializes `data` as pretty-printed JSON and writes it to `filePath` atomically.
 *
 * @param filePath Destination file path (absolute or relative to process cwd).
 * @param data Any JSON-serializable value.
 * @throws if serialization or the underlying filesystem operations fail; the temp file is
 *   removed before the error propagates so no partial artifact is left behind.
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const resolvedPath = path.resolve(filePath);
  const directory = path.dirname(resolvedPath);
  const tempPath = path.join(
    directory,
    `.${path.basename(resolvedPath)}.tmp-${process.pid}-${Date.now()}`,
  );

  const serialized = JSON.stringify(data, null, 2) + "\n";

  try {
    fs.writeFileSync(tempPath, serialized, { encoding: "utf8" });
    fs.renameSync(tempPath, resolvedPath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Best-effort cleanup only; do not mask the original error.
    }
    throw error;
  }
}
