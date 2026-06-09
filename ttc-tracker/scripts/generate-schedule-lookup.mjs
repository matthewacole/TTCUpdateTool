import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GTFS_DIR = "C:/Users/mattcole/AppData/Local/Temp/opencode/ttc-surface";

function parseTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseTimeToSeconds(t) {
  const p = t.split(":").map(Number);
  return p[0] * 3600 + p[1] * 60 + (p[2] ?? 0);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Generating schedule lookup from GTFS...");

  // 1. Determine today's service_ids from calendar.txt
  const now = new Date();
  // Normalize to Toronto date
  const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Toronto" }));
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  console.log(`Today: ${dateStr} (${dayNames[dayOfWeek]})`);

  const calLines = readFileSync(join(GTFS_DIR, "calendar.txt"), "utf8").trim().split("\n");
  const activeServices = new Set();
  for (let i = 1; i < calLines.length; i++) {
    const p = calLines[i].split(",");
    const sid = p[0];
    const sDate = p[8];
    const eDate = p[9];
    if (dateStr < sDate || dateStr > eDate) continue;
    // Check day of week column (1=Mon, 7=Sun)
    const dowIndex = dayOfWeek === 0 ? 7 : dayOfWeek;
    if (p[dowIndex] === "1") {
      activeServices.add(sid);
    }
  }

  // Check calendar_dates.txt for exceptions
  try {
    const cdLines = readFileSync(join(GTFS_DIR, "calendar_dates.txt"), "utf8").trim().split("\n");
    for (let i = 1; i < cdLines.length; i++) {
      const p = cdLines[i].split(",");
      if (p[1] === dateStr) {
        if (p[2] === "1") activeServices.add(p[0]);   // service added
        if (p[2] === "2") activeServices.delete(p[0]); // service removed
      }
    }
  } catch {}

  console.log(`Active services: ${[...activeServices].join(", ") || "none"}`);

  if (activeServices.size === 0) {
    console.log("No active services for today, generating empty schedule");
    const outPath = join(__dirname, "..", "public", "data", "schedule.json");
    writeFileSync(outPath, JSON.stringify({ generatedAt: now.toISOString(), validUntil: "20260620", data: {} }));
    console.log("✓ schedule.json written (empty)");
    return;
  }

  // 2. Read routes.txt: route_id → route_short_name
  console.log("Reading routes.txt...");
  const routeLines = readFileSync(join(GTFS_DIR, "routes.txt"), "utf8").trim().split("\n");
  const routeIdToShortName = new Map();
  for (let i = 1; i < routeLines.length; i++) {
    const p = routeLines[i].split(",");
    routeIdToShortName.set(p[0], p[2]); // route_id → route_short_name
  }
  console.log(`  ${routeIdToShortName.size} routes`);

  // 3. Read stops.txt: stop_id → stop_code
  console.log("Reading stops.txt...");
  const stopLines = readFileSync(join(GTFS_DIR, "stops.txt"), "utf8").trim().split("\n");
  const stopIdToCode = new Map();
  const stopCodeToIds = new Map();
  for (let i = 1; i < stopLines.length; i++) {
    const p = stopLines[i].split(",");
    const sid = p[0];
    const code = p[1];
    if (code) {
      stopIdToCode.set(sid, code);
      if (!stopCodeToIds.has(code)) stopCodeToIds.set(code, []);
      stopCodeToIds.get(code).push(sid);
    }
  }
  console.log(`  ${stopIdToCode.size} stop_id → stop_code mappings`);

  // 4. Read trips.txt (stream) → trip_id → { route_shortName, direction_id }
  // Only for trips with active service_ids
  console.log("Reading trips.txt...");
  const tripMap = new Map();  // trip_id → { shortName, dir }
  let tripCount = 0;
  let matchedTripCount = 0;

  const tripStream = createInterface({ input: createReadStream(join(GTFS_DIR, "trips.txt")), crlfDelay: Infinity });
  let isFirstTripLine = true;
  for await (const line of tripStream) {
    if (isFirstTripLine) { isFirstTripLine = false; continue; }
    tripCount++;
    const p = line.split(",");
    const tripId = p[0];
    const routeId = p[1];
    const serviceId = p[2];
    const dirId = p[5];
    if (activeServices.has(serviceId)) {
      const shortName = routeIdToShortName.get(routeId);
      if (shortName) {
        tripMap.set(tripId, { shortName, dir: dirId });
        matchedTripCount++;
      }
    }
    if (tripCount % 50000 === 0) process.stdout.write(`  ${tripCount} trips processed...\r`);
  }
  console.log(`  ${tripCount} total trips, ${matchedTripCount} matched for today`);

  // 5. Stream stop_times.txt → build schedule
  console.log("Reading stop_times.txt...");
  const schedule = new Map();  // "shortName:stopCode" → Set of seconds
  let stopTimeCount = 0;
  let matchedStopCount = 0;

  const stStream = createInterface({ input: createReadStream(join(GTFS_DIR, "stop_times.txt")), crlfDelay: Infinity });
  let isFirstStLine = true;
  for await (const line of stStream) {
    if (isFirstStLine) { isFirstStLine = false; continue; }
    stopTimeCount++;

    // Split safely for first 4 fields (trip_id, arrival_time, departure_time, stop_id)
    // These are before any quoted fields (stop_headsign at col 5)
    const firstComma = line.indexOf(",");
    if (firstComma === -1) continue;
    const afterTrip = line.indexOf(",", firstComma + 1);
    if (afterTrip === -1) continue;
    const afterArrival = line.indexOf(",", afterTrip + 1);
    if (afterArrival === -1) continue;
    const afterDeparture = line.indexOf(",", afterArrival + 1);
    if (afterDeparture === -1) continue;

    const tripId = line.substring(0, firstComma);
    const depTimeStr = line.substring(afterTrip + 1, afterArrival);
    const stopId = line.substring(afterArrival + 1, afterDeparture);

    const trip = tripMap.get(tripId);
    if (!trip) continue;

    const stopCode = stopIdToCode.get(stopId);
    if (!stopCode) continue;

    const key = `${trip.shortName}:${stopCode}`;
    const mins = Math.round(parseTimeToSeconds(depTimeStr) / 60);

    if (!schedule.has(key)) schedule.set(key, new Set());
    schedule.get(key).add(mins);
    matchedStopCount++;

    if (stopTimeCount % 500000 === 0) process.stdout.write(`  ${stopTimeCount} stop_times processed, ${matchedStopCount} matched\r`);
  }
  console.log(`  ${stopTimeCount} total stop_times, ${matchedStopCount} matched for today`);

  // 6. Sort and convert to plain arrays
  console.log("Sorting schedule data...");
  const data = {};
  let totalEntries = 0;
  for (const [key, secSet] of schedule) {
    const sorted = [...secSet].sort((a, b) => a - b);
    data[key] = sorted;
    totalEntries += sorted.length;
  }
  console.log(`  ${schedule.size} unique route:stop pairs, ${totalEntries} total departures`);

  // 7. Write output
  const outPath = join(__dirname, "..", "public", "data", "schedule.json");
  const output = {
    generatedAt: now.toISOString(),
    validUntil: "20260620",
    data,
  };
  const json = JSON.stringify(output);
  writeFileSync(outPath, json);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
  console.log(`✓ schedule.json written (${data.size} keys, ${totalEntries} departures, ${kb} KB)`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
