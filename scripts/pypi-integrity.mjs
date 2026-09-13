import assert from "node:assert/strict";
import { basename } from "node:path";

/** Use the installation index, which can update before release JSON metadata. */
export async function verifyPyPiFiles(files, fetchImpl = fetch) {
  const response = await fetchImpl("https://pypi.org/simple/wise-sdk/", {
    headers: { Accept: "application/vnd.pypi.simple.v1+json" },
    signal: AbortSignal.timeout(60000),
  });
  assert(response.ok || response.status === 404, "Could not check PyPI");
  if (response.status === 404) return; // The initial publication creates the project.
  const published = await response.json();
  assert(Array.isArray(published.files), "Unexpected PyPI index response");
  for (const file of files) {
    const existing = published.files.filter((entry) => entry.filename === basename(file.path));
    for (const entry of existing) {
      assert.equal(entry.hashes?.sha256, file.sha256, `Published PyPI bytes differ: ${entry.filename}`);
    }
  }
}
