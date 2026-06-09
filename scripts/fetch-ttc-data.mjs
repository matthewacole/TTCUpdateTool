import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "cache");
const GTFSRT_BASE = "https://bustime.ttc.ca/gtfsrt";

const GTFSRT_ENDPOINTS = {
  alerts: `${GTFSRT_BASE}/alerts`,
  vehicles: `${GTFSRT_BASE}/vehicles`,
  trips: `${GTFSRT_BASE}/trips`,
};

async function main() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const results = await Promise.allSettled(
    Object.entries(GTFSRT_ENDPOINTS).map(async ([name, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();

      let json;
      try {
        const gtfsRealtimeBindings = await import("gtfs-realtime-bindings");
        const feed = gtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
          new Uint8Array(buffer),
        );
        json = JSON.stringify(feed, null, 2);
      } catch {
        json = JSON.stringify({ entity: [] });
      }

      const path = join(DATA_DIR, `${name}.json`);
      writeFileSync(path, json);
      console.log(`✓ ${name} (${(json.length / 1024).toFixed(1)} KB)`);
    }),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("✗", result.reason);
    }
  }

  writeFileSync(
    join(DATA_DIR, "index.json"),
    JSON.stringify({ timestamp: Date.now(), updatedAt: new Date().toISOString() }),
  );
  console.log("✓ index.json written");
}

main().catch(console.error);
