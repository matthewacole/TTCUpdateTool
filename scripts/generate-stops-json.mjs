import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GTFS_DIR = "C:/Users/mattcole/AppData/Local/Temp/opencode/ttc-surface";

function main() {
  const csv = readFileSync(join(GTFS_DIR, "stops.txt"), "utf8");
  const lines = csv.trim().split("\n").slice(1);
  const stops = [];

  for (const line of lines) {
    const parts = line.split(",").map((s) => s.trim());
    const locationType = parts[8] ?? "0";
    if (locationType !== "" && locationType !== "0") continue;
    stops.push({
      i: parts[0],
      c: parts[1],
      n: parts[2].replace(/"/g, ""),
      lat: parseFloat(parts[4]),
      lon: parseFloat(parts[5]),
    });
  }

  const outPath = join(__dirname, "..", "public", "data", "stops.json");
  writeFileSync(outPath, JSON.stringify(stops));
  console.log(`✓ stops.json written (${stops.length} stops, ${(Buffer.byteLength(JSON.stringify(stops)) / 1024).toFixed(0)} KB)`);
}

main();
