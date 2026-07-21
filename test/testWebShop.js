#!/usr/bin/env node
/**
 * Tests for the custom endpoints in halpatch/WebShop.hal:
 *   - WebGetProductsCatalog  (company 9 item export, token auth, optional ?artcode=)
 *   - WebGetAdmins           (company 9 UserVc with TelIsBoss=1, token auth)
 *
 * Usage:
 *   node testWebShop.js
 *   BASE_URL="http://89.167.13.108:1080" TOKEN="kn9-cat-7f3a91c2e6" node testWebShop.js
 *
 * Requires Node 18+ (uses global fetch). Exits with code 1 if any check fails.
 */

const BASE_URL = process.env.BASE_URL || "http://89.167.13.108:1080";
const TOKEN = process.env.TOKEN || "kn9-cat-7f3a91c2e6";

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

function isNumericString(v) {
  return typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v));
}

async function fetchJson(url) {
  const started = Date.now();
  const res = await fetch(url);
  const ms = Date.now() - started;
  const text = await res.text();

  // Every WebShop.hal endpoint pads its output with bigblankfile.txt
  // (ADDFILETOAREA) before weboutarea2, so the real JSON is followed by
  // trailing filler. The payload never contains a bare '{' or '}' outside
  // the JSON, so slicing to the outermost braces strips the padding.
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

// ================= WebGetProductsCatalog =================

async function testCatalogUnauthorized(endpoint) {
  console.log(`\n[Catalog 1] Unauthorized request (bad token) -> ${endpoint}?token=WRONG`);
  const { json, status } = await fetchJson(`${endpoint}?token=WRONG`);
  ok("HTTP 200 (HAL returns JSON body, not a real 401)", status === 200, `got ${status}`);
  ok('body.result === "error"', json.result === "error", JSON.stringify(json));
}

async function testCatalogAuthorized(endpoint) {
  console.log(`\n[Catalog 2] Authorized request -> ${endpoint}?token=${TOKEN}`);
  const { json, ms } = await fetchJson(`${endpoint}?token=${TOKEN}`);
  console.log(`  (responded in ${ms}ms)`);

  ok("response has items array", Array.isArray(json.items), JSON.stringify(json).slice(0, 300));
  if (!Array.isArray(json.items)) return [];

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

    if (problems.length > 0) badItems.push({ code: label, problems });
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

  console.log("\n  Sample item:");
  console.log("  " + JSON.stringify(json.items[0], null, 2).split("\n").join("\n  "));

  return json.items;
}

async function testCatalogSingleArtcode(endpoint, items) {
  if (!items || items.length === 0) {
    console.log("\n[Catalog 3] Single artcode lookup — skipped (no items from full catalog)");
    return;
  }
  const target = items[0];
  console.log(`\n[Catalog 3] Single artcode lookup -> ${endpoint}?token=${TOKEN}&artcode=${target.Code}`);
  const { json } = await fetchJson(`${endpoint}?token=${TOKEN}&artcode=${encodeURIComponent(target.Code)}`);

  ok("response has items array", Array.isArray(json.items), JSON.stringify(json).slice(0, 300));
  if (!Array.isArray(json.items)) return;

  ok("exactly one item returned", json.items.length === 1, `got ${json.items.length}`);
  if (json.items.length === 1) {
    ok(`returned item Code matches "${target.Code}"`, json.items[0].Code === target.Code, json.items[0].Code);
    ok("returned item Name matches full-catalog Name", json.items[0].Name === target.Name);
  }

  console.log(`\n[Catalog 4] Single artcode lookup with unknown code -> ${endpoint}?token=${TOKEN}&artcode=NOSUCHCODE_ZZZ`);
  const { json: json2 } = await fetchJson(`${endpoint}?token=${TOKEN}&artcode=NOSUCHCODE_ZZZ`);
  ok("unknown artcode returns empty items array", Array.isArray(json2.items) && json2.items.length === 0, JSON.stringify(json2));
}

async function testProductsCatalog() {
  const endpoint = `${BASE_URL}/WebGetProductsCatalog.hal`;
  console.log(`\n===== WebGetProductsCatalog (${endpoint}) =====`);
  await testCatalogUnauthorized(endpoint);
  const items = await testCatalogAuthorized(endpoint);
  await testCatalogSingleArtcode(endpoint, items);
}

// ================= WebGetAdmins =================

async function testAdminsUnauthorized(endpoint) {
  console.log(`\n[Admins 1] Unauthorized request (bad token) -> ${endpoint}?token=WRONG`);
  const { json, status } = await fetchJson(`${endpoint}?token=WRONG`);
  ok("HTTP 200 (HAL returns JSON body, not a real 401)", status === 200, `got ${status}`);
  ok('body.result === "error"', json.result === "error", JSON.stringify(json));
}

async function testAdminsAuthorized(endpoint) {
  console.log(`\n[Admins 2] Authorized request -> ${endpoint}?token=${TOKEN}`);
  const { json, ms } = await fetchJson(`${endpoint}?token=${TOKEN}`);
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

async function testAdmins() {
  const endpoint = `${BASE_URL}/WebGetAdmins.hal`;
  console.log(`\n===== WebGetAdmins (${endpoint}) =====`);
  await testAdminsUnauthorized(endpoint);
  await testAdminsAuthorized(endpoint);
}

// ================= WebGetStockMovements / WebSetStockMovPrinted =================

async function testStockMovementsUnauthorized(endpoint) {
  console.log(`\n[Movements 1] Unauthorized request (bad token) -> ${endpoint}?token=WRONG`);
  const { json, status } = await fetchJson(`${endpoint}?token=WRONG`);
  ok("HTTP 200 (HAL returns JSON body, not a real 401)", status === 200, `got ${status}`);
  ok('body.result === "error"', json.result === "error", JSON.stringify(json));
}

async function testStockMovementsAuthorized(endpoint) {
  console.log(`\n[Movements 2] Authorized request -> ${endpoint}?token=${TOKEN}`);
  const { json, ms } = await fetchJson(`${endpoint}?token=${TOKEN}`);
  console.log(`  (responded in ${ms}ms)`);

  ok("response has movements array", Array.isArray(json.movements), JSON.stringify(json).slice(0, 300));
  if (!Array.isArray(json.movements)) return [];

  console.log(`  movements count: ${json.movements.length}`);

  let badItems = [];
  for (const mv of json.movements) {
    const label = mv.shipmentNo || "<no shipmentNo>";
    const problems = [];

    if (!isNumericString(String(mv.shipmentNo ?? ""))) problems.push(`shipmentNo not numeric ("${mv.shipmentNo}")`);
    if (typeof mv.toLocation !== "string" || mv.toLocation.trim() === "") problems.push("missing toLocation");

    if (!Array.isArray(mv.items) || mv.items.length === 0) {
      problems.push("items is missing/empty");
    } else {
      for (const it of mv.items) {
        if (typeof it.erpId !== "string" || it.erpId.trim() === "") problems.push("item row with blank erpId");
        if (typeof it.name !== "string" || it.name.trim() === "") problems.push(`item ${it.erpId} has blank name`);
        if (!isNumericString(it.qty) || Number(it.qty) <= 0) problems.push(`item ${it.erpId} has non-positive qty ("${it.qty}")`);
      }
    }

    if (problems.length > 0) badItems.push({ code: label, problems });
  }

  ok(
    `all ${json.movements.length} movements pass field checks`,
    badItems.length === 0,
    badItems.length > 0 ? `${badItems.length} item(s) failed` : ""
  );
  if (badItems.length > 0) {
    console.log("\n  Failing movements:");
    for (const b of badItems) {
      console.log(`   - ${b.code}: ${b.problems.join("; ")}`);
    }
  }

  if (json.movements.length > 0) {
    console.log("\n  Sample movement:");
    console.log("  " + JSON.stringify(json.movements[0], null, 2).split("\n").join("\n  "));
  } else {
    console.log("  (no pending movements — verify there's an un-OK'd StockMovVc from SORTIROVOC in the last 3 days)");
  }

  return json.movements;
}

async function testSetStockMovPrinted(endpoint) {
  console.log(`\n[Movements 3] Unauthorized update (bad token) -> ${endpoint}?token=WRONG&sernr=1`);
  const { json: unauthJson } = await fetchJson(`${endpoint}?token=WRONG&sernr=1`);
  ok('body.result === "error" (unauthorized)', unauthJson.result === "error", JSON.stringify(unauthJson));

  // Deliberately NOT calling this with a real shipmentNo from the movements
  // list above: it flips PrintedFlag=1 on a real pending transfer, which
  // would make WebGetStockMovements silently drop it for the real warehouse
  // integration. Only exercising the safe "not found" path here.
  console.log(`\n[Movements 4] Authorized update, nonexistent sernr -> ${endpoint}?token=${TOKEN}&sernr=999999999`);
  const { json } = await fetchJson(`${endpoint}?token=${TOKEN}&sernr=999999999`);
  ok('body.result === "error" (not_found)', json.result === "error" && json.error === "not_found", JSON.stringify(json));
}

async function testStockMovements() {
  const getEndpoint = `${BASE_URL}/WebGetStockMovements.hal`;
  const setEndpoint = `${BASE_URL}/WebSetStockMovPrinted.hal`;
  console.log(`\n===== WebGetStockMovements / WebSetStockMovPrinted (${BASE_URL}) =====`);
  await testStockMovementsUnauthorized(getEndpoint);
  await testStockMovementsAuthorized(getEndpoint);
  await testSetStockMovPrinted(setEndpoint);
}

// ================= Runner =================

(async () => {
  console.log(`Testing WebShop.hal endpoints on ${BASE_URL}`);
  try {
    await testProductsCatalog();
    await testAdmins();
    await testStockMovements();
  } catch (e) {
    failures++;
    console.error(`\n\x1b[31mERROR:\x1b[0m ${e.message}`);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
})();
