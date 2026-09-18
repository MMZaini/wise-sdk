import assert from "node:assert/strict";
import test from "node:test";
import { compareSpecs } from "../scripts/spec-diff.mjs";
import { nextVersion } from "../scripts/bump-version.mjs";
import { pendingReleaseNotes } from "../scripts/release-notes.mjs";

const original = {
  openapi: "3.0.1", info: { title: "API", version: "1" },
  paths: { "/accounts": { get: { operationId: "list", responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } } } } } },
  components: { schemas: { Account: { type: "object", properties: { uid: { type: "string" }, description: { type: "string" } } } } },
};
const changed = (mutate) => { const result = structuredClone(original); mutate(result); return compareSpecs(original, result); };

test("classifies formatting, documentation and optional response additions", () => {
  assert.equal(compareSpecs(original, structuredClone(original)).kind, "none");
  assert.equal(changed((spec) => { spec.info.description = "Updated"; }).kind, "documentation");
  assert.equal(changed((spec) => { spec.components.schemas.Account.properties.uid.description = "UID"; }).kind, "documentation");
  assert.equal(changed((spec) => { spec.components.schemas.Account.properties.nickname = { type: "string" }; }).kind, "additive");
  assert.equal(changed((spec) => { spec.components.schemas.Money = { type: "integer" }; }).kind, "additive");
});

test("requires review for endpoint, security, required-field and type changes", () => {
  for (const mutate of [
    (spec) => { delete spec.paths["/accounts"]; },
    (spec) => { spec.paths["/new"] = spec.paths["/accounts"]; },
    (spec) => { spec.paths["/accounts"].get.security = [{ Bearer: ["new:scope"] }]; },
    (spec) => { spec.components.schemas.Account.required = ["uid"]; },
    (spec) => { spec.components.schemas.Account.properties.uid.type = "integer"; },
    (spec) => { spec.components.schemas.Account.properties.uid.enum = ["one"]; },
    (spec) => { spec.components.schemas.Account.properties.description.type = "integer"; },
    (spec) => { spec.components.schemas.Account.properties.UID = { type: "string" }; },
    (spec) => { spec.components.schemas.Account.properties.newField = { type: "string" }; spec.components.schemas.Account.required = ["newField"]; },
  ]) assert.equal(changed(mutate).compatible, false);
});

test("request schemas and nested request references need review even for optional additions", () => {
  const before = structuredClone(original);
  before.paths["/accounts"].post = { requestBody: { $ref: "#/components/requestBodies/Input" } };
  before.components.requestBodies = { Input: { content: { "application/json": { schema: { $ref: "#/components/schemas/Wrapper" } } } } };
  before.components.schemas.Wrapper = { properties: { account: { $ref: "#/components/schemas/Account" } } };
  const after = structuredClone(before);
  after.components.schemas.Account.properties.nickname = { type: "string" };
  assert.equal(compareSpecs(before, after).compatible, false);
});

test("quarter rollovers, card hosts and webhook contracts require review", () => {
  const before = structuredClone(original);
  before.servers = [{ url: "https://api.wise.com/2026Q3" }];
  before.paths["/accounts"].get.servers = [{ url: "https://twcard.wise.com" }];
  before.webhooks = { event: { post: { requestBody: { content: { "application/json": { schema: { type: "object" } } } } } } };
  for (const mutate of [
    (spec) => { spec.servers[0].url = "https://api.wise.com/2026Q4"; },
    (spec) => { spec.paths["/accounts"].get.servers[0].url = "https://api.wise.com"; },
    (spec) => { spec.webhooks.event.post.requestBody.required = true; },
  ]) {
    const after = structuredClone(before);
    mutate(after);
    assert.equal(compareSpecs(before, after).compatible, false);
  }
});

test("referenced webhook and callback payload additions require review", () => {
  const event = { post: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } } } };
  for (const attach of [
    (spec) => { spec.webhooks = { event }; },
    (spec) => { spec.paths["/accounts"].get.callbacks = { event: { "{$request.query.callbackUrl}": event } }; },
    (spec) => {
      spec.components.pathItems = { Event: event };
      spec.webhooks = { event: { $ref: "#/components/pathItems/Event" } };
    },
    (spec) => {
      spec.components.callbacks = { Event: { "{$request.query.callbackUrl}": event } };
      spec.paths["/accounts"].get.callbacks = { event: { $ref: "#/components/callbacks/Event" } };
    },
  ]) {
    const before = structuredClone(original);
    attach(before);
    const after = structuredClone(before);
    after.components.schemas.Account.properties.nickname = { type: "string" };
    assert.equal(compareSpecs(before, after).compatible, false);
  }
});

test("version increments distinguish patches from additive releases", () => {
  assert.equal(nextVersion("0.1.9", "patch"), "0.1.10");
  assert.equal(nextVersion("1.9.3", "minor"), "1.10.0");
  assert.throws(() => nextVersion("1.0.0-beta", "patch"));
  assert.throws(() => nextVersion("1.0.0", "major"));
});

const changelog = "# Changelog\n\n## 0.1.1\n\n- Fixed a bug.\n\n## 0.1.0\n\n- Initial release.\n";
const releasedUpTo = (highest) => (value) => value <= highest;

test("release notes include only the requested version and require an exact heading", () => {
  assert.equal(pendingReleaseNotes(changelog, "0.1.1", releasedUpTo("0.1.0")), "- Fixed a bug.\n");
  assert.equal(pendingReleaseNotes(changelog, "0.1.0", () => false), "- Initial release.\n");
  assert.throws(() => pendingReleaseNotes(changelog, "0.1.2", () => false), /newest unreleased section must be 0\.1\.2/);
  assert.throws(() => pendingReleaseNotes(changelog + "\n## 0.1.1\n\n- Duplicate.\n", "0.1.1", () => false), /Duplicate changelog/);
  assert.throws(() => pendingReleaseNotes("# Changelog\n\n## 0.1.1\n\n", "0.1.1", () => false), /must not be empty/);
  assert.throws(() => pendingReleaseNotes("# Changelog\n\n## Unreleased\n\n- Pending.\n", "0.1.1", () => false), /Unexpected changelog heading/);
});

test("a version prepared but never tagged keeps its notes in the next release", () => {
  // 0.2.0 was prepared and left untagged; an automatic update then released 0.2.1.
  const deferred = "# Changelog\n\n## 0.2.1\n\n- Regenerated.\n\n## 0.2.0\n\n- Breaking: error responses changed.\n\n## 0.1.1\n\n- Fixed a bug.\n";
  const notes = pendingReleaseNotes(deferred, "0.2.1", releasedUpTo("0.1.1"));
  assert.match(notes, /^## 0\.2\.1\n\n- Regenerated\.$/m);
  assert.match(notes, /^## 0\.2\.0\n\n- Breaking: error responses changed\.$/m);
  assert(!notes.includes("Fixed a bug"), "Released versions must not be repeated");
  // Once 0.2.0 has its own release the notes narrow back to a single section.
  assert.equal(pendingReleaseNotes(deferred, "0.2.1", releasedUpTo("0.2.0")), "- Regenerated.\n");
});

test("a resumed release reproduces its notes even after it was published", () => {
  // The run is always its own subject, so re-running never empties the notes.
  assert.equal(pendingReleaseNotes(changelog, "0.1.1", () => true), "- Fixed a bug.\n");
});
