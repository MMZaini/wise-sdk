import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { checkPublishSource } from "./check-publish-source.mjs";
import { verifyPyPiFiles } from "./pypi-integrity.mjs";

const manifest = JSON.parse(await readFile("artifacts/manifest.json", "utf8"));
checkPublishSource(manifest);
const files = manifest.files.filter((entry) => entry.registry === "pypi");
for (const file of files) {
  const path = resolve("artifacts", file.path);
  assert(path.startsWith(resolve("artifacts/pypi") + sep));
  assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), file.sha256);
}
await verifyPyPiFiles(files);
console.log("PyPI artifact checksums verified.");
