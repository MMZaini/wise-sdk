import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const url = "https://docs.wise.com/_bundle/api-reference/@latest/index.json?download";
const response = await fetch(url, {
  headers: { "User-Agent": "wise-sdk-spec-updater/0.1" },
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) throw new Error(`Spec download failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const spec = JSON.parse(bytes.toString("utf8"));
if (!spec.openapi?.startsWith("3.") || !spec.paths || !spec.components?.schemas) {
  throw new Error("The upstream response is not a Wise OpenAPI document");
}
const versions = new Set(spec.servers.map(({ url }) => new URL(url).pathname.slice(1)));
if (versions.size !== 1 || !/^\d{4}Q[1-4]$/.test([...versions][0])) {
  throw new Error("Review the upstream API version and server URLs");
}
const apiVersion = [...versions][0];
await mkdir("openapi", { recursive: true });
const previous = await readFile("openapi/wise.json").catch(() => null);
if (previous?.equals(bytes)) {
  console.log("The upstream specification is unchanged.");
} else {
  await writeFile("openapi/wise.json", bytes);
  await writeFile("openapi/source.json", JSON.stringify({
    url, retrievedAt: new Date().toISOString(), apiVersion,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }, null, 2) + "\n");
  console.log(`Updated the ${apiVersion} specification. Run npm run spec:check before generation.`);
}
