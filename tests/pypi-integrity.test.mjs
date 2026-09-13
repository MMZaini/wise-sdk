import assert from "node:assert/strict";
import test from "node:test";
import { verifyPyPiFiles } from "../scripts/pypi-integrity.mjs";

const wheel = { path: "pypi/wise_sdk-0.1.1-py3-none-any.whl", sha256: "a".repeat(64) };
const sdist = { path: "pypi/wise_sdk-0.1.1.tar.gz", sha256: "b".repeat(64) };

test("partial PyPI releases check existing bytes through the installation index", async () => {
  const respond = async (url, options) => {
    assert.equal(url, "https://pypi.org/simple/wise-sdk/");
    assert.equal(options.headers.Accept, "application/vnd.pypi.simple.v1+json");
    return Response.json({ files: [{ filename: wheel.path.split("/").at(-1), hashes: { sha256: wheel.sha256 } }] });
  };
  await verifyPyPiFiles([wheel, sdist], respond);
  await assert.rejects(verifyPyPiFiles([{ ...wheel, sha256: "c".repeat(64) }, sdist], respond), /Published PyPI bytes differ/);
});

test("PyPI outages or missing hashes cannot masquerade as an unpublished release", async () => {
  await verifyPyPiFiles([wheel], async () => new Response(null, { status: 404 }));
  await verifyPyPiFiles([wheel], async () => Response.json({ files: [] }));
  for (const response of [new Response(null, { status: 503 }), Response.json({}),
    Response.json({ files: [{ filename: wheel.path.split("/").at(-1), hashes: {} }] })]) {
    await assert.rejects(verifyPyPiFiles([wheel], async () => response));
  }
});
