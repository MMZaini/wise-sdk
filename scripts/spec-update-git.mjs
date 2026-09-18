import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { compareSpecs } from "./spec-diff.mjs";
import { nextVersion, specReleaseSummary } from "./bump-version.mjs";
import { withRetry } from "./retry.mjs";

// The committed specification is larger than execFileSync's 1 MiB default buffer,
// so reading a blob with `git show` needs an explicit limit or the merge dies with ENOBUFS.
const MAX_OUTPUT = 256 * 1024 * 1024;
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", maxBuffer: MAX_OUTPUT, stdio: ["ignore", "pipe", "inherit"], env: {
  ...process.env, GIT_AUTHOR_NAME: "MMZaini", GIT_AUTHOR_EMAIL: "mahdizainipro@gmail.com",
  GIT_COMMITTER_NAME: "MMZaini", GIT_COMMITTER_EMAIL: "mahdizainipro@gmail.com",
} }).trim();
const git = (...args) => run("git", args);
const gh = (...args) => run("gh", args);
const output = async (name, value) => appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
const report = JSON.parse(await readFile("artifacts/spec-update/report.json", "utf8"));
assert(/^[a-f0-9]{40}$/.test(report.base));
assert(/^[a-f0-9]{64}$/.test(report.specSha));
assert(process.env.GITHUB_REPOSITORY === "MMZaini/wise-sdk", "Configure the repository and commit identity before using this workflow in a fork");
const branch = `automation/spec-${report.specSha.slice(0, 12)}-${report.base.slice(0, 7)}`;
const permitted = (path) => /^(openapi\/(wise\.json|source\.json|operations\.json)|docs\/naming-map\.md|CHANGELOG\.md|sdks\/typescript\/(package(-lock)?\.json|src\/generated\/.+)|sdks\/python\/(pyproject\.toml|src\/wise_sdk\/generated\/.+|src\/wise_sdk\/__init__\.py)|packages\/react\/package(-lock)?\.json)$/.test(path);

function checkChanges(args) {
  const paths = git("diff", ...args, "--name-only", "-z").split("\0").filter(Boolean);
  assert(paths.length && paths.every(permitted), "The generated update changed files outside its allowed paths");
  for (const path of paths) {
    const entry = git("ls-files", "--stage", "--", path);
    assert(!entry || entry.startsWith("100644 ") || entry.startsWith("100755 "), "Unexpected symlink or submodule in generated output");
  }
}

async function checkVersionChanges(version) {
  for (const directory of ["sdks/typescript", "packages/react"]) {
    for (const name of ["package.json", "package-lock.json"]) {
      const path = `${directory}/${name}`;
      const before = JSON.parse(git("show", `${report.base}:${path}`));
      const after = JSON.parse(await readFile(path, "utf8"));
      assert.equal(after.version, version);
      after.version = before.version;
      if (after.packages?.[""]) {
        assert.equal(after.packages[""].version, version);
        after.packages[""].version = before.packages[""].version;
      }
      assert.deepEqual(after, before, "Automatic releases may only change package versions, not dependencies or configuration");
    }
  }
  const path = "sdks/python/pyproject.toml";
  const before = git("show", `${report.base}:${path}`);
  const after = (await readFile(path, "utf8")).trim();
  assert.equal(after, before.replace(/^version = "[^"]+"$/m, `version = "${version}"`));
  const modulePath = "sdks/python/src/wise_sdk/__init__.py";
  const moduleBefore = git("show", `${report.base}:${modulePath}`);
  assert.equal((await readFile(modulePath, "utf8")).trim(), moduleBefore.replace(/^__version__ = "[^"]+"$/m, `__version__ = "${version}"`), "Only the Python runtime version may change outside generated code");
  const changelog = git("show", `${report.base}:CHANGELOG.md`);
  const expected = report.version ? changelog.replace(/^# Changelog\n+/, `# Changelog\n\n## ${version}\n\n- ${specReleaseSummary(report.kind)}\n\n`) : changelog;
  assert.equal((await readFile("CHANGELOG.md", "utf8")).trim(), expected.trim());
}

const COMMIT_MESSAGE = "Update the Wise API specification";
const IDENTITY = "mahdizainipro@gmail.com";
const AUTOMATION_BRANCH = /^automation\/spec-[0-9a-f]{12}-[0-9a-f]{7}$/;

/** Only this workflow's own untouched proposal may be closed on its behalf. */
function isUntouchedProposal(number) {
  const { commits } = JSON.parse(gh("pr", "view", String(number), "--json", "commits"));
  return commits.length === 1 && commits[0].messageHeadline === COMMIT_MESSAGE
    && commits[0].authors.length > 0 && commits[0].authors.every((author) => author.email === IDENTITY);
}

/**
 * Every upstream snapshot gets its own branch, so without this each daily run
 * would leave another proposal behind. A proposal someone has edited is kept.
 */
function supersede(open, keep) {
  for (const pr of open) {
    if (pr.number === keep.number || pr.baseRefName !== "main" || !AUTOMATION_BRANCH.test(pr.headRefName)) continue;
    // Tidying up is not worth failing a run that has already proposed its update.
    try {
      if (!isUntouchedProposal(pr.number)) {
        console.log(`Leaving #${pr.number} open: it has manual commits.`);
        continue;
      }
      gh("pr", "close", String(pr.number), "--delete-branch",
        "--comment", `Superseded by #${keep.number}, which proposes a newer Wise specification snapshot.`);
      console.log(`Closed superseded #${pr.number} and deleted its branch.`);
    } catch (error) {
      console.log(`::warning title=Could not close #${pr.number}::${error.message}`);
    }
  }
}

/** Report why an update needs review where the reviewer already is: on the PR. */
async function generationLog() {
  const log = await readFile("artifacts/spec-update/generate.log", "utf8").catch(() => "");
  const lines = log.replace(/\x1b\[[0-9;]*m/g, "").trimEnd().split("\n").slice(-40);
  const text = lines.join("\n").slice(-4000);
  if (!text.trim()) return "";
  return ["", "<details><summary>Generation output</summary>", "", "```", text, "```", "", "</details>", ""].join("\n");
}

if (process.argv[2] === "propose") {
  assert.equal(git("rev-parse", "HEAD"), report.base);
  const existing = JSON.parse(gh("pr", "list", "--state", "open", "--limit", "100", "--json", "number,headRefName,headRefOid,isDraft,url,baseRefName"));
  const draft = existing.find((pr) => pr.isDraft && pr.headRefName.startsWith(`automation/spec-${report.specSha.slice(0, 12)}-`));
  if (draft) {
    console.log(`This snapshot already needs review: ${draft.url}`);
    supersede(existing, draft);
    await output("head", "");
  } else {
    let pr = existing.find((entry) => entry.headRefName === branch);
    let head;
    if (pr) {
      git("fetch", "origin", `refs/heads/${branch}`);
      head = git("rev-parse", "FETCH_HEAD");
      assert.equal(head, pr.headRefOid, "The update branch changed; retry the workflow");
      // Never reset or overwrite an existing branch, including a contributor's edits.
    } else {
      assert.equal(git("status", "--porcelain"), "", "Expected a clean checkout");
      const remote = git("ls-remote", "--heads", "origin", `refs/heads/${branch}`);
      if (remote) {
        // Resume a run that pushed its branch but failed before creating the PR.
        git("fetch", "origin", `refs/heads/${branch}`);
        head = git("rev-parse", "FETCH_HEAD");
        git("switch", "--detach", head);
        checkChanges([`${report.base}...HEAD`]);
      } else {
        git("switch", "-c", branch);
        git("apply", "--index", "artifacts/spec-update/update.patch");
        checkChanges(["--cached"]);
        git("diff", "--cached", "--check");
        git("commit", "--quiet", "-m", COMMIT_MESSAGE);
        head = git("rev-parse", "HEAD");
        git("push", "origin", `HEAD:refs/heads/${branch}`);
      }
      const detail = report.changes.slice(0, 30).map((change) => `- ${change.reason}: ${JSON.stringify(change.path)}`).join("\n");
      const body = `Update the official Wise OpenAPI snapshot and regenerate both clients.\n\n${report.automatic
        ? `Classified as ${report.kind}. The full CI matrix must pass before this workflow merges the update${report.version ? ` and publishes ${report.version}` : ""}.`
        : `This change requires manual review${report.generated === false ? " because generation failed" : ` because it is classified as ${report.kind}`}. Resolve the reported compatibility or generation failures, then regenerate before preparing a release.`}\n\n${detail}\n${report.automatic ? "" : await generationLog()}\n[Workflow checks](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})\n`;
      await writeFile("artifacts/spec-update/pr-body.md", body);
      const url = gh("pr", "create", "--base", "main", "--head", branch, "--title", COMMIT_MESSAGE, "--body-file", "artifacts/spec-update/pr-body.md", ...(report.automatic ? [] : ["--draft"]));
      pr = JSON.parse(gh("pr", "view", url, "--json", "number,url"));
    }
    supersede(existing, pr);
    if (!report.automatic) {
      // A review request is not a broken workflow, so the run stays green and
      // announces the work instead.
      console.log(`::notice title=Wise specification update needs review::${pr.url}`);
    }
    await output("head", head);
    await output("pull_request", pr.number);
    console.log(pr.url);
  }
} else if (process.argv[2] === "merge") {
  assert(report.automatic === true, "Only compatible, generated updates may merge automatically");
  const head = process.env.UPDATE_HEAD;
  assert(/^[a-f0-9]{40}$/.test(head));
  const pr = JSON.parse(gh("pr", "view", process.env.UPDATE_PR, "--json", "state,isDraft,headRefOid,baseRefName,mergeCommit"));
  assert.equal(pr.baseRefName, "main");
  assert.equal(pr.headRefOid, head, "The tested PR changed; refusing to merge it");
  assert(!pr.isDraft);
  git("fetch", "origin", "main", "--tags");
  git("fetch", "origin", `refs/heads/${branch}`);
  let merge;
  if (pr.state === "MERGED") {
    merge = pr.mergeCommit.oid;
    git("merge-base", "--is-ancestor", head, merge);
    git("merge-base", "--is-ancestor", merge, "origin/main");
    git("diff", "--exit-code", head, merge);
  } else {
    assert.equal(pr.state, "OPEN");
    assert.equal(git("rev-parse", "origin/main"), report.base, "Main changed during CI; the next run will prepare an update against the new base");
    assert.equal(git("rev-parse", "FETCH_HEAD"), head);
    git("switch", "--detach", head);
    checkChanges([`${report.base}...HEAD`]);
    assert.equal(git("rev-list", "--count", `${report.base}..HEAD`), "1", "Additional commits on the update branch require manual review");
    assert.equal(git("show", "-s", "--format=%an <%ae>|%cn <%ce>"), "MMZaini <mahdizainipro@gmail.com>|MMZaini <mahdizainipro@gmail.com>");
    const before = JSON.parse(git("show", `${report.base}:openapi/wise.json`));
    const after = JSON.parse(await readFile("openapi/wise.json", "utf8"));
    assert.equal(createHash("sha256").update(await readFile("openapi/wise.json")).digest("hex"), report.specSha);
    const compared = compareSpecs(before, after);
    assert(compared.compatible && compared.kind === report.kind, "Compatibility changed after preparing the update");
    const current = JSON.parse(git("show", `${report.base}:sdks/typescript/package.json`)).version;
    const version = JSON.parse(await readFile("sdks/typescript/package.json", "utf8")).version;
    assert.equal(version, report.version || current);
    if (report.version) assert.equal(version, nextVersion(current, compared.bump));
    await checkVersionChanges(version);
    git("switch", "-C", "main", "origin/main");
    git("merge", "--no-ff", head, "-m", "Merge the Wise specification update");
    git("diff", "--exit-code", head, "HEAD");
    merge = git("rev-parse", "HEAD");
    git("push", "origin", "HEAD:refs/heads/main");
  }
  // Leaving merged branches behind only accumulates refs, but GitHub records the
  // merge from the push to main: deleting the branch before it does would close
  // the pull request instead of marking it merged.
  const recorded = await withRetry(() => {
    const { state } = JSON.parse(gh("pr", "view", process.env.UPDATE_PR, "--json", "state"));
    if (state !== "MERGED") throw new Error(`The pull request is still ${state}`);
    return true;
  }, { attempts: 5 }).catch(() => false);
  if (!recorded) console.log("Leaving the update branch: GitHub has not recorded the merge yet.");
  else {
    try {
      git("push", "origin", "--delete", `refs/heads/${branch}`);
      console.log(`Deleted the merged ${branch} branch.`);
    } catch {
      console.log(`The ${branch} branch was already deleted.`);
    }
  }
  if (report.version) {
    const tag = `v${report.version}`;
    const existing = git("tag", "--list", tag);
    if (existing) assert.equal(git("rev-parse", `${tag}^{commit}`), merge, "The version tag already points to a different commit");
    else {
      git("tag", "-a", tag, merge, "-m", `Release ${tag}`);
      git("push", "origin", `refs/tags/${tag}`);
    }
    // GITHUB_TOKEN pushes do not trigger another workflow; dispatch the tagged release explicitly.
    gh("workflow", "run", "release.yml", "--ref", tag);
    console.log(`Merged the tested update and dispatched ${tag}.`);
  } else console.log("Merged the formatting-only update; no package release is needed.");
} else throw new Error("Expected propose or merge");
