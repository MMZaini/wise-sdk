import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import YAML from "yaml";

export async function prepareSpec(upstream) {
  const spec = structuredClone(upstream);
  const supplements = YAML.parse(await readFile("fern/supplements.yml", "utf8"));
  const download = supplements.statementDownloads;
  const base = upstream.paths[download.basePath];
  assert(base?.get?.responses?.["200"]?.content?.["application/json"], "Review the statement format supplement");
  assert(!spec.paths[download.path], "The statement download is now defined upstream; review the supplement");
  const item = structuredClone(base);
  item.get.operationId = download.operationId;
  item.get.summary = "Download a balance statement";
  item.get.description = `Download one of the statement formats documented at ${download.source}. Query parameters and errors match the JSON statement endpoint. XML uses CAMT.053.`;
  item.get.parameters ??= [];
  item.get.parameters.push({ name: "format", in: "path", required: true,
    description: "Statement file format. XML uses CAMT.053.", schema: { type: "string", enum: download.formats } });
  item.get.responses["200"].content = { "application/octet-stream": { schema: { type: "string", format: "binary" } } };
  item.get["x-wise-sdk-supplement"] = download.source;
  spec.paths[download.path] = item;
  await mkdir("fern/.generated", { recursive: true });
  await writeFile("fern/.generated/openapi.json", JSON.stringify(spec, null, 2) + "\n");
  return spec;
}
