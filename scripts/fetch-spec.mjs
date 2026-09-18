import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PermanentError, retryableStatus, withRetry } from "./retry.mjs";

const url = "https://docs.wise.com/_bundle/api-reference/@latest/index.json?download";
// Transport failures, truncated bodies and upstream backpressure are all retried:
// a scheduled run must not go red because one TLS connection dropped.
const { bytes, spec } = await withRetry(async () => {
  const response = await fetch(url, {
    headers: { "User-Agent": "wise-sdk-spec-updater/0.1" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const message = `Spec download failed: HTTP ${response.status}`;
    throw retryableStatus(response.status) ? new Error(message) : new PermanentError(message);
  }
  const body = Buffer.from(await response.arrayBuffer());
  try {
    return { bytes: body, spec: JSON.parse(body.toString("utf8")) };
  } catch (error) {
    throw new Error(`The upstream response is not valid JSON: ${error.message}`);
  }
});
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
