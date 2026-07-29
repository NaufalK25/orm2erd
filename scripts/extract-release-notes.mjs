#!/usr/bin/env node
// Extracts one version's section from CHANGELOG.md for the GitHub Release body.
//
// CHANGELOG.md hard-wraps prose at ~90 cols for readable source diffs — fine
// for the file view (CommonMark collapses soft-wrapped lines back into one
// paragraph), but GitHub's release-body renderer treats every newline as a
// hard <br>, so the wrap points show up as mid-sentence line breaks. Rejoin
// each paragraph/list-item's wrapped lines into one line before writing it
// out.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("Usage: extract-release-notes.mjs <version>");
  process.exit(1);
}

const lines = readFileSync("CHANGELOG.md", "utf8").split("\n");
const startRe = new RegExp(`^## .*\\[${version.replace(/\./g, "\\.")}\\]`);

const section = [];
let capturing = false;
for (const line of lines) {
  if (startRe.test(line)) {
    capturing = true;
    continue;
  }
  if (capturing && line.startsWith("## ")) break;
  if (capturing) section.push(line);
}

const isBlockStart = (line) =>
  line === "" || /^(#{1,6}\s|[-*]\s|\d+\.\s|```)/.test(line);

let inFence = false;
const unwrapped = [];
for (const line of section) {
  if (line.startsWith("```")) inFence = !inFence;

  const isContinuation =
    !inFence &&
    unwrapped.length > 0 &&
    unwrapped[unwrapped.length - 1] !== "" &&
    !isBlockStart(line);

  if (isContinuation) {
    // A wrap right after a bare `/` (e.g. `Entity.description`/ ->
    // `Field.description`) was never a real space in the source — the
    // slash itself was the break point. Every other wrap replaces an
    // actual space, so rejoin with one.
    const prev = unwrapped[unwrapped.length - 1];
    const joiner = prev.endsWith("/") ? "" : " ";
    unwrapped[unwrapped.length - 1] = prev + joiner + line.trim();
  } else {
    unwrapped.push(line);
  }
}

writeFileSync("release-notes.md", unwrapped.join("\n"));
