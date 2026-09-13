import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { relative, dirname } from "node:path";

// Checked workarounds for the pinned Fern generators. A changed upstream shape
// must be reviewed before an SDK can be regenerated or released.
async function patch(path, before, after, count = 1) {
  const source = (await readFile(path, "utf8")).replaceAll("\r\n", "\n");
  if (source.split(after).length - 1 === count) return;
  if (!source.includes(before)) {
    assert.equal(source.split(after).length - 1, count, `Review Fern patch: ${path}`);
    return;
  }
  assert.equal(source.split(before).length - 1, count, `Review Fern patch: ${path}`);
  await writeFile(path, source.replaceAll(before, after));
}

export async function postprocess(group) {
  if (group === "python") {
    const root = "sdks/python/src/wise_sdk/generated";
    await patch(`${root}/core/http_client.py`,
      '        "x-access-token",',
      '        "x-access-token",\n        "x-2fa-approval",\n        "one-time-token",\n        "x-tw-twcard-card-token",');
    await patch(`${root}/core/http_client.py`,
      'return response.status_code >= 500 or response.status_code in [429, 408, 409]',
      'return (500 <= response.status_code < 600 or response.status_code in [429, 408]) and (_parse_retry_after(response.headers) or 0) <= MAX_RETRY_DELAY_SECONDS');
    await patch(`${root}/core/http_client.py`,
      'return int(retry_after_ms) / 1000 if retry_after_ms > 0 else 0',
      'return max(0, int(retry_after_ms) / 1000)');
    await patch(`${root}/core/http_client.py`, 'if retry_after is not None and retry_after > 0:', 'if retry_after is not None and retry_after >= 0:');
    await patch(`${root}/core/http_client.py`, `        max_retries: int = (
            request_options.get("max_retries", self.base_max_retries)
            if request_options is not None
            else self.base_max_retries
        )`, `        max_retries: int = (
            request_options.get("max_retries", self.base_max_retries)
            if request_options is not None
            else self.base_max_retries
        )
        if not isinstance(max_retries, int) or isinstance(max_retries, bool) or max_retries < 0:
            raise ValueError("max_retries must be a non-negative integer")
        if method.upper() not in ("GET", "HEAD", "OPTIONS") or (path and path.lstrip("/").startswith("simulation/")):
            max_retries = 0`, 2);
    await patch(`${root}/simulations/raw_client.py`,
      "if _response is None or not _response.text.strip():",
      "if 200 <= _response.status_code < 300 and not _response.text.strip():", 6);
    for (const entry of await readdir(root, { recursive: true })) {
      if (!entry.endsWith(".py")) continue;
      const path = `${root}/${entry}`;
      const source = await readFile(path, "utf8");
      const normalized = source.replace(/[ \t]+$/gm, "").trimEnd() + "\n";
      if (source !== normalized) await writeFile(path, normalized);
    }
    return;
  }
  const root = "sdks/typescript/src/generated";
  const requests = [
    "api/resources/recipients/client/requests/CreateRecipientsRequest.ts",
    "api/resources/webhooks/resources/applications/client/requests/CreateApplicationsRequest.ts",
    "api/resources/webhooks/resources/profiles/client/requests/CreateProfilesRequest.ts",
  ];
  for (const name of requests) {
    const path = `${root}/${name}`;
    const source = await readFile(path, "utf8");
    assert(source.includes("Wise."), `Review flattened request import: ${path}`);
    const target = relative(dirname(path), `${root}/api/index.js`).replaceAll("\\", "/");
    const statement = `import type * as Wise from "${target}";`;
    if (!source.includes(statement)) await writeFile(path, statement + "\n\n" + source);
  }
  // The local webhook fee namespace named Wise shadows the imported namespace.
  await patch(`${root}/api/types/V430.ts`,
    'import type * as Wise from "../index.js";',
    'import type * as Wise from "../index.js";\nimport type * as WiseApi from "../index.js";');
  await patch(`${root}/api/types/V430.ts`, "Wise.Amount", "WiseApi.Amount", 4);

  await patch(`${root}/core/fetcher/makeRequest.ts`,
    "    const response = await fetchFn(url, {",
    "    try {\n    const response = await fetchFn(url, {");
  await patch(`${root}/core/fetcher/makeRequest.ts`,
    "    if (timeoutAbortId != null) {\n        clearTimeout(timeoutAbortId);\n    }\n\n    return response;",
    "    return response;\n    } finally {\n        if (timeoutAbortId != null) clearTimeout(timeoutAbortId);\n    }");

  const parser = `${root}/core/fetcher/getResponseBody.ts`;
  await patch(parser, `        } catch (_err) {
            return {
                ok: false,
                error: {
                    reason: "non-json",
                    statusCode: response.status,
                    rawBody: text,
                },
            };
        }`, `        } catch (_err) {
            throw new InvalidJsonResponseError(response, text);
        }`);
  let source = await readFile(parser, "utf8");
  if (!source.includes("export class InvalidJsonResponseError")) {
    source += `\nexport class InvalidJsonResponseError extends Error {
    constructor(public readonly response: Response, public readonly rawBody: string) {
        super("Wise returned invalid JSON");
    }
}\n`;
    await writeFile(parser, source);
  }
  const fetcher = `${root}/core/fetcher/Fetcher.ts`;
  await patch(fetcher, '    "x-access-token",',
    '    "x-access-token",\n    "x-2fa-approval",\n    "one-time-token",\n    "x-tw-twcard-card-token",');
  await patch(fetcher, "response.status >= 200 && response.status < 400", "response.status >= 200 && response.status < 300");
  await patch(fetcher, 'import { getResponseBody } from "./getResponseBody.js";',
    'import { getResponseBody, InvalidJsonResponseError } from "./getResponseBody.js";');
  await patch(fetcher, "    } catch (error) {\n        if (args.abortSignal?.aborted) {", `    } catch (error) {
        if (error instanceof InvalidJsonResponseError) {
            return {
                ok: false,
                error: { reason: "non-json", statusCode: error.response.status, rawBody: error.rawBody },
                rawResponse: toRawResponse(error.response),
            };
        }
        if (args.abortSignal?.aborted) {`);

  const jsonPath = `${root}/core/json.ts`;
  const jsonSource = await readFile(jsonPath, "utf8");
  assert(jsonSource.startsWith('const BIGINT_MARKER = "#bigint#";') || jsonSource.includes('from "../../json.js"'),
    "Review the Fern JSON codec replacement");
  await writeFile(jsonPath, '// Applied by scripts/postprocess.mjs.\nexport { fromJson, toJson } from "../../json.js";\n');

  // Detect new instances of the flattened request import defect.
  for (const entry of await readdir(`${root}/api/resources`, { recursive: true })) {
    if (!entry.endsWith("Request.ts")) continue;
    const body = await readFile(`${root}/api/resources/${entry}`, "utf8");
    assert(!/\bWise\.[A-Z]\w*/.test(body) || body.includes("import type * as Wise"), `Missing namespace import: ${entry}`);
  }
}
