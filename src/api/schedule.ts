let scheduleData: Record<string, number[]> | null = null;

async function loadSchedule(): Promise<Record<string, number[]>> {
  if (scheduleData) return scheduleData;
  try {
    const res = await fetch("./data/schedule.json");
    const json = await res.json();
    scheduleData = (json as { data: Record<string, number[]> }).data;
    return scheduleData!;
  } catch {
    return {};
  }
}

const TZ = "America/Toronto";

function nowInTorontoMs(): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  let h = 0, m = 0, s = 0;
  for (const p of parts) {
    if (p.type === "hour") h = +p.value;
    if (p.type === "minute") m = +p.value;
    if (p.type === "second") s = +p.value;
  }
  return h * 3600000 + m * 60000 + s * 1000;
}

function minToMs(m: number): number {
  return m * 60000;
}

export interface ScheduledDeparture {
  time: string;
  minutes: number;
}

export async function getNextScheduled(
  routeId: number,
  stopCode: string,
): Promise<ScheduledDeparture | null> {
  const data = await loadSchedule();
  const key = `${routeId}:${stopCode}`;
  const deps = data[key];
  if (!deps || deps.length === 0) return null;

  const nowMs = nowInTorontoMs();
  let lo = 0, hi = deps.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (minToMs(deps[mid]) < nowMs) lo = mid + 1;
    else hi = mid;
  }

  let depMin: number;
  if (lo < deps.length) {
    depMin = deps[lo];
  } else {
    depMin = deps[0] + 1440;
  }

  const depMs = minToMs(depMin);
  let diffMs = depMs - nowMs;
  if (diffMs < 0) diffMs += 86400000;

  const diffMin = Math.round(diffMs / 60000);
  const hh = Math.floor(depMin / 60) % 24;
  const mm = depMin % 60;
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 || 12;
  const timeStr = `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;

  return { time: timeStr, minutes: Math.max(1, diffMin) };
}
