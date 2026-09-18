import assert from "node:assert/strict";

const numbers = (value) => value.split(".").map(Number);
const compare = (left, right) => {
  const [a, b] = [numbers(left), numbers(right)];
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
};

/**
 * A release that is prepared but never tagged would otherwise strand its notes:
 * the next release publishes only its own section, and the changes it carries
 * along go unmentioned. Cover every version still missing a release.
 */
export function pendingReleaseNotes(changelog, current, isReleased) {
  assert(/^\d+\.\d+\.\d+$/.test(current));
  const sections = changelog.replace(/\r\n/g, "\n").split(/^## /m).slice(1);
  const pending = [];
  for (const section of sections) {
    const heading = section.split("\n", 1)[0].trim();
    assert(/^\d+\.\d+\.\d+$/.test(heading), `Unexpected changelog heading: ${heading}`);
    if (compare(heading, current) > 0) continue;
    // This release is always its own subject, so a resumed run keeps its notes.
    if (heading !== current && isReleased(heading)) break;
    const notes = section.slice(heading.length).trim();
    assert(notes, `Release notes must not be empty for ${heading}`);
    pending.push({ heading, notes });
  }
  assert(pending.length, `Expected one changelog section for ${current}`);
  assert.equal(pending[0].heading, current, `The newest unreleased section must be ${current}`);
  assert.equal(new Set(pending.map((entry) => entry.heading)).size, pending.length, "Duplicate changelog sections");
  // One version behaves exactly as before: the heading would only repeat the tag.
  if (pending.length === 1) return pending[0].notes + "\n";
  return pending.map((entry) => `## ${entry.heading}\n\n${entry.notes}`).join("\n\n") + "\n";
}
