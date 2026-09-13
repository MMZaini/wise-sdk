import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Agent } from "undici";
import { createMtlsFetch, WiseClient } from "../src/index.js";

test("mTLS authenticates with a temporary CA and rejects missing credentials", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const localPython = `${root}.venv/bin/python`;
  const child = spawn(process.env.PYTHON ?? (existsSync(localPython) ? localPython : "python3"), [`${root}tests/mtls-server.py`], { stdio: ["pipe", "pipe", "inherit"] });
  try {
    const lines = createInterface({ input: child.stdout });
    const configuration = await Promise.race([
      (async () => { for await (const line of lines) return JSON.parse(line); throw new Error("mTLS server failed"); })(),
      new Promise<never>((_, reject) => child.once("error", reject)),
    ]);
    const transport = createMtlsFetch({ cert: await readFile(configuration.cert), key: await readFile(configuration.key),
      ca: await readFile(configuration.ca), origins: [configuration.origin] });
    try {
      const client = new WiseClient({ accessToken: "test", environment: { api: `${configuration.origin}/2026Q3`, cards: configuration.origin }, fetch: transport.fetch });
      assert.deepEqual(await client.profiles.list(), []);
      const withoutCertificate = new Agent({ connect: { ca: await readFile(configuration.ca), rejectUnauthorized: true } });
      try {
        await assert.rejects(globalThis.fetch(configuration.origin, { dispatcher: withoutCertificate } as RequestInit));
      } finally { await withoutCertificate.close(); }
    } finally { await transport.close(); }
  } finally {
    child.stdin.end("stop\n");
    await new Promise<void>((resolve) => { if (child.exitCode !== null) resolve(); else child.once("exit", () => resolve()); });
  }
});
