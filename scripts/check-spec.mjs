import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import YAML from "yaml";
import { prepareSpec } from "./prepare-spec.mjs";

const bytes = await readFile("openapi/wise.json");
const source = JSON.parse(await readFile("openapi/source.json", "utf8"));
assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256, "Upstream checksum changed");
const spec = await prepareSpec(JSON.parse(bytes));
const overrides = YAML.parse(await readFile("fern/overrides.yml", "utf8"));
const config = YAML.parse(await readFile("fern/generators.yml", "utf8"));
assert.equal(source.apiVersion, "2026Q3", "A new API quarter requires an explicit migration");
for (const environment of Object.values(config.api.environments)) {
  assert.equal(new URL(environment.urls.api).pathname, `/${source.apiVersion}`, "Environment API version mismatch");
}
const verbs = new Set(["get", "post", "put", "delete", "patch", "head", "options"]);
const names = new Set();
const ids = new Set();
const operations = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!verbs.has(method)) continue;
    const override = overrides.paths?.[path]?.[method];
    assert(override, `Add an override for ${method.toUpperCase()} ${path}`);
    const group = override["x-fern-sdk-group-name"];
    const name = override["x-fern-sdk-method-name"];
    const qualified = `${[].concat(group).join(".")}.${name}`;
    assert(group && name, `Missing SDK name for ${operation.operationId}`);
    assert(!names.has(qualified), `Duplicate SDK name: ${qualified}`);
    assert(operation.operationId && !ids.has(operation.operationId), "Missing or duplicate operation ID");
    names.add(qualified); ids.add(operation.operationId);
    if (!["get", "head", "options"].includes(method) || [].concat(group).includes("simulations")) {
      assert.equal(override["x-fern-retries"]?.disabled, true, `Disable retries for ${operation.operationId}`);
    }
    const server = override["x-fern-server-name"];
    assert(["api", "cards"].includes(server), `Missing server for ${operation.operationId}`);
    const security = operation.security ?? spec.security ?? [];
    const basic = security.some((requirement) => "BasicAuth" in requirement);
    assert.deepEqual(override.security, basic ? [{ ClientCredentials: [] }] : security.length ? [{ AccessToken: [] }] : []);
    operations.push({ method: method.toUpperCase(), path, operationId: operation.operationId,
      group, name, server, security, generated: true,
      ...(operation["x-wise-sdk-supplement"] ? { supplementSource: operation["x-wise-sdk-supplement"] } : {}) });
  }
}
for (const [path, item] of Object.entries(overrides.paths ?? {})) {
  for (const method of Object.keys(item).filter((key) => verbs.has(key))) {
    assert(spec.paths[path]?.[method], `Remove stale override: ${method} ${path}`);
  }
}
await mkdir("docs", { recursive: true });
await writeFile("openapi/operations.json", JSON.stringify(operations, null, 2) + "\n");
const snake = (value) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const supplemental = operations.filter((operation) => operation.supplementSource).length;
const lines = ["# Endpoint map", "", `Generated from Wise's ${source.apiVersion} specification and the Fern overrides: ${operations.length - supplemental} upstream REST operations and ${supplemental} documented format supplement. Account permissions still apply. Original authentication alternatives and supplement sources are recorded in \`openapi/operations.json\`.`, "", "| HTTP | Path | TypeScript | Python | Server |", "| --- | --- | --- | --- | --- |"];
for (const op of operations) {
  const group = [].concat(op.group).join(".");
  lines.push(`| ${op.method} | \`${op.path}\` | \`${group}.${op.name}\` | \`${snake(group)}.${snake(op.name)}\` | ${op.server} |`);
}
await writeFile("docs/naming-map.md", lines.join("\n") + "\n");
console.log(`Checked ${operations.length} REST operations and ${Object.keys(spec.webhooks ?? {}).length} webhook definitions.`);
