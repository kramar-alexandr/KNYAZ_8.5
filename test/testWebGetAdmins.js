#!/usr/bin/env node
/**
 * Test for the WebGetAdmins HAL endpoint (halpatch/WebShop.hal).
 * Returns UserVc records (company 9) with TelIsBoss=1.
 *
 * Usage:
 *   node testWebGetAdmins.js
 *   BASE_URL="http://89.167.13.108:1080" TOKEN="kn9-cat-7f3a91c2e6" node testWebGetAdmins.js
 *
 * Requires Node 18+ (uses global fetch). Exits with code 1 if any check fails.
 */

const BASE_URL = process.env.BASE_URL || "http://89.167.13.108:1080";
const TOKEN = process.env.TOKEN || "kn9-cat-7f3a91c2e6";
const ENDPOINT = `${BASE_URL}/WebGetAdmins.hal`;

let failures = 0;
let passes = 0;

function ok(label, cond, detail) {
  if (cond) {
    passes++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    failures++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? " — " + detail : ""}`);
  }
}

async function fetchJson(url) {
  const started = Date.now();
  const res = await fetch(url);
  const ms = Date.now() - started;
  const text = await res.text();

  // Endpoint pads output with bigblankfile.txt before weboutarea2, so slice
  // to the outermost braces to strip the trailing filler before parsing.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidate = start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;

  let json;
  try {
    json = JSON.parse(candidate);
  } catch (e) {
    throw new Error(
      `Response was not valid JSON (status ${res.status}, ${ms}ms).\n` +
        `First 500 chars:\n${text.slice(0, 500)}`
    );
  }
  return { status: res.status, ms, json, raw: text };
}

async function testUnauthorized() {
  console.log(`\n[1] Unauthorized request (bad token) -> ${ENDPOINT}?token=WRONG`);
  const { json, status } = await fetchJson(`${ENDPOINT}?token=WRONG`);
  ok("HTTP 200 (HAL returns JSON body, not a real 401)", status === 200, `got ${status}`);
  ok('body.result === "error"', json.result === "error", JSON.stringify(json));
}

async function testAuthorized() {
  console.log(`\n[2] Authorized request -> ${ENDPOINT}?token=${TOKEN}`);
  const { json, ms } = await fetchJson(`${ENDPOINT}?token=${TOKEN}`);
  console.log(`  (responded in ${ms}ms)`);

  ok("response has admins array", Array.isArray(json.admins), JSON.stringify(json).slice(0, 300));
  if (!Array.isArray(json.admins)) return;

  console.log(`  admins count: ${json.admins.length}`);

  const codeSeen = new Set();
  let dupCodes = 0;
  let badItems = [];

  for (const admin of json.admins) {
    const label = admin.Code || "<no code>";
    const problems = [];

    if (typeof admin.Code !== "string" || admin.Code.trim() === "") problems.push("missing Code");
    if (typeof admin.Name !== "string" || admin.Name.trim() === "") problems.push("missing Name");
    if (typeof admin.Phone1 !== "string") problems.push("Phone1 missing (should at least be empty string)");
    if (typeof admin.Phone2 !== "string") problems.push("Phone2 missing (should at least be empty string)");

    if (codeSeen.has(admin.Code)) {
      dupCodes++;
      problems.push("duplicate Code");
    }
    codeSeen.add(admin.Code);

    if (problems.length > 0) badItems.push({ code: label, problems });
  }

  ok("no duplicate admin codes", dupCodes === 0, `${dupCodes} duplicates`);
  ok(
    `all ${json.admins.length} admins pass field checks`,
    badItems.length === 0,
    badItems.length > 0 ? `${badItems.length} item(s) failed` : ""
  );

  if (badItems.length > 0) {
    console.log("\n  Failing admins:");
    for (const b of badItems) {
      console.log(`   - ${b.code}: ${b.problems.join("; ")}`);
    }
  }

  if (json.admins.length > 0) {
    console.log("\n  Sample admin:");
    console.log("  " + JSON.stringify(json.admins[0], null, 2).split("\n").join("\n  "));
  } else {
    console.log("  (no admins found — verify at least one UserVc in company 9 has TelIsBoss=1 and Closed=0)");
  }
}

(async () => {
  console.log(`Testing WebGetAdmins at ${ENDPOINT}`);
  try {
    await testUnauthorized();
    await testAuthorized();
  } catch (e) {
    failures++;
    console.error(`\n\x1b[31mERROR:\x1b[0m ${e.message}`);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
})();
