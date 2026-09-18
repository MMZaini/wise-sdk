import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { checkPublishSource } from "./check-publish-source.mjs";
import { PermanentError, retryableStatus, withRetry } from "./retry.mjs";

assert(process.env.npm_execpath, "Run npm run publish:npm");
const manifest = JSON.parse(await readFile("artifacts/manifest.json", "utf8"));
checkPublishSource(manifest);
for (const file of manifest.files.filter((entry) => entry.registry === "npm")) {
  const artifact = resolve("artifacts", file.path);
  assert(artifact.startsWith(resolve("artifacts/npm") + sep));
  const bytes = await readFile(artifact);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, "Artifact checksum changed");
  // A registry blip must not publish a second time or abandon a half-done release.
  const response = await withRetry(async () => {
    const result = await fetch(`https://registry.npmjs.org/${encodeURIComponent(file.name)}/${file.version}`, { signal: AbortSignal.timeout(60_000) });
    if (result.ok || result.status === 404) return result;
    const message = `Could not check the npm registry: HTTP ${result.status}`;
    throw retryableStatus(result.status) ? new Error(message) : new PermanentError(message);
  });
  if (response.ok) {
    const published = await response.json();
    assert.equal(published.dist?.integrity, file.integrity, `Published bytes differ for ${file.name}@${file.version}`);
    console.log(`${file.name}@${file.version} already exists with matching integrity.`);
    continue;
  }
  assert.equal(response.status, 404, "Could not check the npm registry");
  const provenance = process.env.GITHUB_ACTIONS === "true" ? ["--provenance"] : [];
  execFileSync(process.execPath, [process.env.npm_execpath, "publish", artifact, "--access", "public", "--ignore-scripts", ...provenance], { stdio: "inherit" });
}
