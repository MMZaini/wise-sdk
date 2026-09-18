import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { prepareSpec } from "./prepare-spec.mjs";

const VERBS = new Set(["get", "post", "put", "delete", "patch", "head", "options"]);

/**
 * New upstream operations stop generation on purpose: the SDK must never drop an
 * endpoint silently. Emit an entry a maintainer can paste and name, so the daily
 * update reports the exact work it needs instead of an unexplained assertion.
 */
export function overrideSuggestion({ method, path, operation, security }) {
  const scheme = security.some((requirement) => "BasicAuth" in requirement) ? "ClientCredentials"
    : security.length ? "AccessToken" : null;
  const lines = [`  ${path}:`, `    ${method}:`,
    `      x-fern-sdk-group-name: TODO # tags: ${operation.tags?.join(", ") || "none"}`,
    `      x-fern-sdk-method-name: TODO # operationId: ${operation.operationId ?? "none"}`,
    "      x-fern-server-name: api # use cards for twcard hosts"];
  lines.push(scheme ? `      security:\n        - ${scheme}: []` : "      security: []");
  // Writes and every simulation helper must not be retried automatically.
  if (!["get", "head", "options"].includes(method) || path.startsWith("/simulation/")) {
    lines.push("      x-fern-retries:", "        disabled: true");
  }
  return lines.join("\n");
}

export function describeMissingOverrides(missing) {
  const list = missing.map(({ method, path, operation }) => `  ${method.toUpperCase()} ${path} (${operation.operationId ?? "no operationId"})`);
  return [`Add Fern overrides for ${missing.length} new operation${missing.length === 1 ? "" : "s"}:`, ...list,
    "", "Suggested fern/overrides.yml entries. Choose SDK names, then regenerate:", "",
    "paths:", ...missing.map(overrideSuggestion), ""].join("\n");
}

async function checkSpec() {
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
  const names = new Set();
  const ids = new Set();
  const operations = [];
  const missing = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!VERBS.has(method)) continue;
      const security = operation.security ?? spec.security ?? [];
      const override = overrides.paths?.[path]?.[method];
      if (!override) { missing.push({ method, path, operation, security }); continue; }
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
      const basic = security.some((requirement) => "BasicAuth" in requirement);
      assert.deepEqual(override.security, basic ? [{ ClientCredentials: [] }] : security.length ? [{ AccessToken: [] }] : []);
      operations.push({ method: method.toUpperCase(), path, operationId: operation.operationId,
        group, name, server, security, generated: true,
        ...(operation["x-wise-sdk-supplement"] ? { supplementSource: operation["x-wise-sdk-supplement"] } : {}) });
    }
  }
  const stale = [];
  for (const [path, item] of Object.entries(overrides.paths ?? {})) {
    for (const method of Object.keys(item).filter((key) => VERBS.has(key))) {
      if (!spec.paths[path]?.[method]) stale.push(`  ${method.toUpperCase()} ${path}`);
    }
  }
  // Report every unmapped operation at once: one run should show all the work.
  const problems = [];
  if (missing.length) problems.push(describeMissingOverrides(missing));
  if (stale.length) problems.push([`Remove ${stale.length} stale override${stale.length === 1 ? "" : "s"} for operations upstream no longer defines:`, ...stale, ""].join("\n"));
  if (problems.length) throw new Error("\n\n" + problems.join("\n"));

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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await checkSpec();
