import assert from "node:assert/strict";
import test from "node:test";
import { extractId, formatDuration, parseDuration, tokenize } from "../utils.js";

test("parseDuration supports combined units", () => {
  assert.equal(parseDuration("1d 2h 30m"), 95_400_000);
  assert.equal(parseDuration("45s"), 45_000);
});

test("parseDuration rejects incomplete and invalid values", () => {
  assert.equal(parseDuration("2 hours"), null);
  assert.equal(parseDuration("0m"), null);
  assert.equal(parseDuration("10m garbage"), null);
});

test("formatDuration returns a static combined duration", () => {
  assert.equal(formatDuration(93_780_000), "1d 2h 3m");
  assert.equal(formatDuration(60_001), "1m 1s");
  assert.equal(formatDuration(1), "1s");
});

test("tokenize preserves quoted command arguments", () => {
  assert.deepEqual(tokenize('ban @user "repeated spam"'), [
    "ban",
    "@user",
    "repeated spam"
  ]);
});

test("extractId accepts mentions and raw IDs", () => {
  assert.equal(extractId("<@123456789012345678>"), "123456789012345678");
  assert.equal(extractId("123456789012345678"), "123456789012345678");
  assert.equal(extractId("not-a-user"), null);
});
