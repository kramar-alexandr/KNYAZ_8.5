#!/usr/bin/env node
/**
 * Test for the WebGetProductsCatalog HAL endpoint (halpatch/WebShop.hal).
 *
 * Usage:
 *   node testWebGetProductsCatalog.js
 *   BASE_URL="http://89.167.13.108:1080" TOKEN="kn9-cat-7f3a91c2e6" node testWebGetProductsCatalog.js
 *
 * Requires Node 18+ (uses global fetch). Exits with code 1 if any check fails.
 */

const BASE_URL = process.env.BASE_URL || "http://89.167.13.108:1080";
const TOKEN = process.env.TOKEN || "kn9-cat-7f3a91c2e6";
const ENDPOINT = `${BASE_URL}/WebGetProductsCatalog.hal`;

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

  // The HAL endpoint pads its output with bigblankfile.txt (ADDFILETOAREA)
  // before weboutarea2, so the real JSON is followed by trailing filler.
  // The payload itself never contains a bare '{' or '}' outside the JSON,
  // so slicing to the outermost braces reliably strips the padding.
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

function isNumericString(v) {
  return typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v));
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

  ok("response has items array", Array.isArray(json.items), JSON.stringify(json).slice(0, 300));
  if (!Array.isArray(json.items)) return;

  console.log(`  items count: ${json.items.length}`);
  ok("catalog is not empty", json.items.length > 0);

  const codeSeen = new Set();
  let dupCodes = 0;
  let noPriceCount = 0;
  let badItems = [];

  for (const item of json.items) {
    const label = item.Code || "<no code>";
    const problems = [];

    if (typeof item.Code !== "string" || item.Code.trim() === "") problems.push("missing Code");
    if (typeof item.Name !== "string" || item.Name.trim() === "") problems.push("missing Name");
    // Blank Price ("") is valid — means the item has no RRP3 price-list entry.
    if (item.Price !== "" && !isNumericString(item.Price)) {
      problems.push(`Price not numeric or blank ("${item.Price}")`);
    } else if (item.Price === "") {
      noPriceCount++;
    }

    if (!Array.isArray(item.Descriptions)) {
      problems.push("Descriptions is not an array");
    } else {
      for (const d of item.Descriptions) {
        if (typeof d.Text !== "string" || d.Text.trim() === "") {
          problems.push("Descriptions row with blank Text");
        }
      }
    }

    if (!Array.isArray(item.Stock) || item.Stock.length === 0) {
      problems.push("Stock is missing/empty (item should have been omitted if it has no stock anywhere)");
    } else {
      for (const s of item.Stock) {
        if (typeof s.Location !== "string" || s.Location.trim() === "") {
          problems.push("Stock row with blank Location");
        }
        if (!isNumericString(s.Qty) || Number(s.Qty) === 0) {
          problems.push(`Stock row with non-numeric/zero Qty ("${s.Qty}") at ${s.Location}`);
        }
      }
    }

    if (codeSeen.has(item.Code)) {
      dupCodes++;
      problems.push("duplicate Code in catalog");
    }
    codeSeen.add(item.Code);

    if (problems.length > 0) {
      badItems.push({ code: label, problems });
    }
  }

  ok("no duplicate item codes", dupCodes === 0, `${dupCodes} duplicates`);
  ok(
    `all ${json.items.length} items pass field checks`,
    badItems.length === 0,
    badItems.length > 0 ? `${badItems.length} item(s) failed` : ""
  );
  console.log(`  (info) items with no RRP3 price entry: ${noPriceCount}`);

  if (badItems.length > 0) {
    console.log("\n  First few failing items:");
    for (const b of badItems.slice(0, 10)) {
      console.log(`   - ${b.code}: ${b.problems.join("; ")}`);
    }
  }

  const sample = json.items[0];
  console.log("\n  Sample item:");
  console.log("  " + JSON.stringify(sample, null, 2).split("\n").join("\n  "));
}

(async () => {
  console.log(`Testing WebGetProductsCatalog at ${ENDPOINT}`);
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
