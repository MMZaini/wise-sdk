import { spawnSync } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

const groups = process.argv.slice(2);
if (!groups.length) groups.push("typescript", "python");
if (groups.some((group) => !["typescript", "python"].includes(group))) throw new Error("Expected typescript or python");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result;
};
run(process.execPath, ["scripts/check-spec.mjs"], { stdio: "inherit" });
run("docker", ["info"], { stdio: "ignore" });
const version = JSON.parse(await readFile("fern/fern.config.json", "utf8")).version;
for (const group of groups) {
  console.log(`Generating ${group} with Fern ${version}`);
  const result = run(process.execPath, [resolve("node_modules/fern-api/cli.cjs"), "generate", "--local", "--force", "--group", group], {
    env: { ...process.env, FERN_NO_VERSION_REDIRECTION: "true" }, maxBuffer: 30 * 1024 * 1024,
  });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  if (/Failed|Generator failed/i.test(result.stdout + result.stderr)) throw new Error("Fern reported a generator failure");
  const directory = resolve(group === "typescript" ? "sdks/typescript/src/generated" : "sdks/python/src/wise_sdk/generated");
  if (!(await readdir(directory)).length) throw new Error(`Fern produced no ${group} source`);
  for (const name of [".fern-metadata.json", "README.md", "CONTRIBUTING.md", "reference.md", "tests", ".fern"]) {
    const target = resolve(directory, name);
    if (!target.startsWith(directory + sep)) throw new Error("Generation cleanup escaped its output directory");
    await rm(target, { force: true, recursive: true });
  }
}
