import { useState, useEffect, useCallback } from "preact/hooks";
import { WidgetBase } from "./widget-base";
import { preferences, dataCache } from "../store";
import { ttcApi, gtfsRtApi, mapAlert } from "../api";
import type { GtfsRtAlertEntity } from "../api";
import { getNextScheduled, getRouteIdsForStop } from "../api/schedule";
import { ALL_ROUTES } from "../data/routes-list";
import { NIGHT_ROUTE_MAP, isNightHours } from "../data/night-routes";
import { SettingsPanel } from "./settings-panel";
import type { FavoriteStop, TrackedStop, TrackedStopRoute } from "../store";
import type { ServiceAlert, VehicleArrival, Route, RouteType } from "../types";

interface DashboardWidgetProps {
  onAddStop: () => void;
}

interface NearbyStop {
  code: string;
  name: string;
  lat: number;
  lon: number;
  distance: number;
  routes: Route[];
}

function relativeTime(epoch: number): string {
  const diff = Date.now() - epoch;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDate(epoch: number): string {
  if (!epoch) return "";
  const d = new Date(epoch);
  const now = new Date();
  const fmt: Intl.DateTimeFormatOptions = {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  };
  if (d.getFullYear() !== now.getFullYear()) fmt.year = "numeric";
  return d.toLocaleDateString("en-US", fmt);
}

function dirBadge(dest: string | null): string {
  const d = (dest ?? "").toLowerCase();
  if (d.includes("north")) return "NB";
  if (d.includes("south")) return "SB";
  if (d.includes("east")) return "EB";
  if (d.includes("west")) return "WB";
  return "";
}

const CAUSE_FORMAT: Record<string, { emoji: string; label: string; cssClass: string }> = {
  CONSTRUCTION: { emoji: "🚧", label: "Construction", cssClass: "cause--construction" },
  WEATHER: { emoji: "🌧️", label: "Weather", cssClass: "cause--weather" },
  ACCIDENT: { emoji: "💥", label: "Accident", cssClass: "cause--accident" },
  MAINTENANCE: { emoji: "🔧", label: "Maintenance", cssClass: "cause--maintenance" },
  TECHNICAL_PROBLEM: { emoji: "⚙️", label: "Technical", cssClass: "cause--technical" },
  STRIKE: { emoji: "⛔", label: "Strike", cssClass: "cause--strike" },
  DEMONSTRATION: { emoji: "✊🏿", label: "Demonstration", cssClass: "cause--demonstration" },
  POLICE_ACTIVITY: { emoji: "🚔", label: "Police", cssClass: "cause--police" },
  MEDICAL_EMERGENCY: { emoji: "🚑", label: "Medical", cssClass: "cause--medical" },
  HOLIDAY: { emoji: "🎉", label: "Holiday", cssClass: "cause--holiday" },
};

function formatCause(cause: string): { emoji: string; label: string; cssClass: string } {
  return CAUSE_FORMAT[cause] ?? { emoji: "ℹ️", label: "Other", cssClass: "cause--other" };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface RawStop { i: string; c: string; n: string; lat: number; lon: number }
let stopsCache: RawStop[] | null = null;

async function loadStops(): Promise<RawStop[]> {
  if (stopsCache) return stopsCache;
  const res = await fetch("./data/stops.json");
  stopsCache = (await res.json()) as RawStop[];
  return stopsCache!;
}

type GpsStatus = "idle" | "locating" | "ready" | "denied" | "unavailable";

function routeFromShortName(shortName: string): Route {
  const info = ALL_ROUTES.find((r) => r.shortName === shortName);
  const numericId = parseInt(shortName, 10) || 0;
  const typeMap: Record<string, RouteType> = { subway: 1, streetcar: 0, bus: 3, express: 3, night: 3 };
  return {
    id: numericId, gtfsId: shortName, agencyId: 0, agency: null,
    shortName, longName: info?.longName ?? shortName, description: "",
    type: info ? (typeMap[info.type] ?? 3) : 3,
    colour: info ? `#${info.color}` : null,
    textColour: info ? `#${info.textColor}` : null,
    active: true, inService: true, direction: 0,
    serviceLevel: null, frequency: null, message: null, is10MinutesNetwork: false,
  };
}

async function loadRoutesForStop(stopCode: string): Promise<Route[]> {
  try {
    return await ttcApi.getRoutesByStop(stopCode);
  } catch {}
  const routeIds = await getRouteIdsForStop(stopCode);
  return routeIds.map(routeFromShortName);
}

export function DashboardWidget({ onAddStop }: DashboardWidgetProps) {
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [trackedStops, setTrackedStops] = useState<TrackedStop[]>([]);
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [predictions, setPredictions] = useState<Record<string, VehicleArrival[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduled, setScheduled] = useState<Record<string, { time: string; minutes: number } | null>>({});
  const [lastFetch, setLastFetch] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [addedStops, setAddedStops] = useState<Set<string>>(new Set);
  const [nearbyErrors, setNearbyErrors] = useState<Record<string, string>>({});
  const [trackingLoading, setTrackingLoading] = useState<Record<string, boolean>>({});
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set);
  const [nightScheduled, setNightScheduled] = useState<Record<string, { time: string; minutes: number } | null>>({});
  const [showSettings, setShowSettings] = useState(false);

  const fetchPredictions = useCallback(async () => {
    const prefs = preferences.get();
    const favs = prefs.favoriteStops;
    const tracks = prefs.trackedStops;
    setFavorites(favs);
    setTrackedStops(tracks);

    const pairs: { routeId: number; stopCode: string; routeName: string; routeColour: string | null }[] = [];
    const seen = new Set<string>();
    for (const f of favs) {
      const k = `${f.routeId}:${f.stopCode}`;
      if (!seen.has(k)) { seen.add(k); pairs.push({ routeId: f.routeId, stopCode: f.stopCode, routeName: f.routeName, routeColour: f.routeColour }); }
    }
    for (const t of tracks) {
      for (const r of t.routes) {
        const k = `${r.id}:${t.stopCode}`;
        if (!seen.has(k)) { seen.add(k); pairs.push({ routeId: r.id, stopCode: t.stopCode, routeName: r.shortName, routeColour: r.colour }); }
      }
    }

    const results = await Promise.allSettled(
      pairs.map(async ({ routeId, stopCode }) => {
        const key = `${routeId}:${stopCode}`;
        try {
          const cached = dataCache.getPredictions(routeId, stopCode);
          if (cached) return { key, vehicles: cached.vehicles, error: null };
          const data = await ttcApi.getNextBuses(routeId, stopCode);
          dataCache.setPredictions(data);
          return { key, vehicles: data.vehicles, error: null };
        } catch (err) {
          return { key, vehicles: [], error: err instanceof Error ? err.message : "Failed" };
        }
      }),
    );

    const newPredictions: Record<string, VehicleArrival[]> = {};
    const newErrors: Record<string, string> = {};
    const scheduledPromises: Promise<{ key: string; result: { time: string; minutes: number } | null }>[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { key, vehicles, error } = result.value;
        if (error) {
          newErrors[key] = error;
        } else {
          const valid = vehicles.filter((v) => Number.isFinite(v.minutes) && v.minutes >= 0);
          newPredictions[key] = valid;
          if (valid.length === 0) {
            const [routeIdStr, stopCode] = key.split(":");
            scheduledPromises.push(
              getNextScheduled(parseInt(routeIdStr, 10), stopCode).then((r) => ({ key, result: r })),
            );
          }
        }
      }
    }

    setPredictions((prev) => ({ ...prev, ...newPredictions }));
    setErrors((prev) => ({ ...prev, ...newErrors }));
    for (const key of Object.keys(newPredictions)) {
      setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }

    const scheduledResults = await Promise.all(scheduledPromises);
    const newScheduled: Record<string, { time: string; minutes: number } | null> = {};
    for (const { key, result } of scheduledResults) {
      newScheduled[key] = result;
    }
    setScheduled((prev) => ({ ...prev, ...newScheduled }));

    const newNight: Record<string, { time: string; minutes: number } | null> = {};
    if (isNightHours()) {
      const nightPromises: Promise<{ key: string; result: { time: string; minutes: number } | null }>[] = [];
      for (const p of pairs) {
        const nightId = NIGHT_ROUTE_MAP[String(p.routeId)];
        if (nightId) {
          nightPromises.push(
            getNextScheduled(parseInt(nightId, 10), p.stopCode).then((r) => ({ key: `${p.routeId}:${p.stopCode}`, result: r })),
          );
        }
      }
      const nightResults = await Promise.all(nightPromises);
      for (const { key, result } of nightResults) {
        newNight[key] = result;
      }
    }
    setNightScheduled(newNight);

    setLastFetch(Date.now());
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const cached = dataCache.getAlerts();
      if (cached) { setAlerts(cached); return; }
      const data = await gtfsRtApi.getAlerts();
      dataCache.setAlerts(data);
      setAlerts(data);
    } catch {}
  }, []);

  useEffect(() => {
    setTrackedStops(preferences.get().trackedStops);
    fetchPredictions();
    fetchAlerts();
    const pi = setInterval(fetchPredictions, 30000);
    const ti = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(pi); clearInterval(ti); };
  }, [fetchPredictions, fetchAlerts]);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const raw = e.detail as GtfsRtAlertEntity[];
      setAlerts(raw.map(mapAlert));
    };
    window.addEventListener("alerts:updated", handler as EventListener);
    return () => window.removeEventListener("alerts:updated", handler as EventListener);
  }, []);

  const handleFindNearby = () => {
    if (gpsStatus === "locating") return;
    setGpsStatus("locating");
    setNearbyStops([]);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const all = await loadStops();
          const distances = all.map((s) => ({
            code: s.c, name: s.n, lat: s.lat, lon: s.lon,
            distance: haversine(pos.coords.latitude, pos.coords.longitude, s.lat, s.lon),
            routes: [] as Route[],
          }));
          distances.sort((a, b) => a.distance - b.distance);
          const top = distances.slice(0, 8);
          for (let i = 0; i < top.length; i++) {
            top[i].routes = await loadRoutesForStop(top[i].code);
          }
          setNearbyStops(top);
          setGpsStatus("ready");
        } catch {
          setGpsStatus("unavailable");
        }
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const handleDelete = (routeId: number, stopCode: string) => {
    preferences.removeFavorite(routeId, stopCode);
    setFavorites([...preferences.get().favoriteStops]);
    const key = `${routeId}:${stopCode}`;
    setPredictions((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setScheduled((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleAddNearbyRoute = async (stop: NearbyStop, route: Route) => {
    setNearbyErrors((prev) => { const n = { ...prev }; delete n[stop.code]; return n; });
    const routeId = parseInt(route.shortName, 10) || route.id;
    preferences.addFavorite({ routeId, routeName: route.shortName, routeColour: route.colour, stopCode: stop.code, stopName: stop.name });
    await fetchPredictions();
    setAddedStops((prev) => new Set(prev).add(stop.code));
    setTimeout(() => setAddedStops((prev) => { const n = new Set(prev); n.delete(stop.code); return n; }), 2000);
  };

  const handleAddNearby = async (stop: NearbyStop) => {
    const routes = stop.routes.length > 0 ? stop.routes : await loadRoutesForStop(stop.code);
    const route = routes[0];
    if (!route) {
      setNearbyErrors((prev) => ({ ...prev, [stop.code]: "Could not load routes for this stop" }));
      return;
    }
    handleAddNearbyRoute(stop, route);
  };

  const handleTrack = async (stopCode: string, stopName: string, existingRoutes?: TrackedStopRoute[]) => {
    setTrackingLoading((prev) => ({ ...prev, [stopCode]: true }));
    let base = existingRoutes ?? [];
    try {
      const apiRoutes = await ttcApi.getRoutesByStop(stopCode);
      const apiMapped: TrackedStopRoute[] = apiRoutes.map((r) => ({
        id: parseInt(r.shortName, 10) || r.id,
        shortName: r.shortName,
        colour: r.colour,
      }));
      const seen = new Set(apiMapped.map((r) => r.id));
      for (const r of base) {
        if (!seen.has(r.id)) {
          apiMapped.push(r);
          seen.add(r.id);
        }
      }
      base = apiMapped;
    } catch {}
    if (base.length === 0) { setTrackingLoading((prev) => ({ ...prev, [stopCode]: false })); return; }
    const tracked: TrackedStop = { stopCode, stopName, routes: base };
    preferences.toggleTracked(tracked);
    setTrackedStops(preferences.get().trackedStops);
    setTrackingLoading((prev) => ({ ...prev, [stopCode]: false }));
    fetchPredictions();
  };

  const handleUntrack = (stopCode: string) => {
    preferences.removeTrackedStop(stopCode);
    setTrackedStops(preferences.get().trackedStops);
  };

  const alertFilter = preferences.get().alertFilter;
  const userRouteIds = new Set([
    ...favorites.map((f) => String(f.routeId)),
    ...trackedStops.flatMap((t) => t.routes.map((r) => String(r.id))),
  ]);
  const subwayRouteIds = new Set(ALL_ROUTES.filter((r) => r.type === "subway").map((r) => r.shortName));
  const filteredAlerts = alertFilter === "priority"
    ? alerts.filter(
        (a) => a.severity !== "INFO" || a.routes.some((rid) => subwayRouteIds.has(rid) || userRouteIds.has(rid)),
      )
    : alerts;
  const hasFavorites = favorites.length > 0;
  const hasNearby = nearbyStops.length > 0;
  const sinceSec = Math.floor((now - lastFetch) / 1000);
  const label = sinceSec < 60 ? `${sinceSec}s ago` : `${Math.floor(sinceSec / 60)}m ago`;

  function renderArrival(vehicles: VehicleArrival[], err: string | undefined, sched: { time: string; minutes: number } | null | undefined) {
    if (err) return <span class="dw__row-error">{err}</span>;
    if (vehicles.length === 0 && sched) return <span class="dw__row-sched">📍 {sched.time}</span>;
    if (vehicles.length === 0) return <span class="dw__row-none">—</span>;
    return (
      <>
        {vehicles.slice(0, 3).map((v, i) => (
          <span key={i} class="dw__row-time"><span class="dw__live-dot" />{v.minutes}<small>m</small></span>
        ))}
        {vehicles.length > 3 && <span class="dw__row-more">+{vehicles.length - 3}</span>}
      </>
    );
  }

  return (
    <>
      <WidgetBase size="large">
        <div class="dw">
          <div class="dw__header">
            <span class="dw__title">TTC Tracker</span>
            <div class="dw__header-right">
              <span class="dw__updated">Updated {label}</span>
              <button class="dw__settings" onClick={() => setShowSettings(true)} aria-label="Settings">⚙️</button>
              <button class="dw__add" onClick={onAddStop} aria-label="Add stop">+</button>
            </div>
          </div>

          <div class="dw__alerts">
            <div class="at__header">
              <span>🚨 Service Alerts</span>
              <span class="at__count">{filteredAlerts.length}</span>
            </div>
            <div class="at__list">
              {filteredAlerts.map((a) => {
                const isExpanded = expandedAlerts.has(a.id);
                const cause = formatCause(a.cause);
                const severityClass = a.severity.toLowerCase();
                const extraClass = a.severity === "INFO" ? ` ${cause.cssClass}` : "";
                return (
                  <div
                    key={a.id}
                    class={`at__row at__row--${severityClass}${extraClass}${isExpanded ? " at__row--expanded" : ""}`}
                    onClick={() => setExpandedAlerts((prev) => {
                      const n = new Set(prev);
                      if (n.has(a.id)) n.delete(a.id); else n.add(a.id);
                      return n;
                    })}
                  >
                    <div class="at__row-top">
                      <span class="at__dot" />
                      <span class="at__sev">
                        {a.severity === "SEVERE" ? "Severe" : a.severity === "WARNING" ? "Warning" : `${cause.emoji} ${cause.label}`}
                      </span>
                      <span class="at__header-text">{a.header}</span>
                    </div>
                    <div class="at__row-mid">
                      {a.routes.length > 0 && (
                        <span class="at__routes">
                          {a.routes.slice(0, 6).map((rid) => (
                            <span key={rid} class="at__route-badge">{rid}</span>
                          ))}
                          {a.routes.length > 6 && <span class="at__route-more">+{a.routes.length - 6}</span>}
                        </span>
                      )}
                      {isExpanded ? (
                        <span class="at__desc at__desc--full">{a.description}</span>
                      ) : a.description ? (
                        <span class="at__desc at__desc--truncated">{a.description}</span>
                      ) : null}
                    </div>
                    <span class="at__time">{formatDate(a.createdAt)} · {relativeTime(a.updatedAt)}</span>
                  </div>
                );
              })}
            </div>
            <div class="at__empty" style={{ display: filteredAlerts.length === 0 ? "block" : "none" }}>
              {alertFilter === "priority" ? "No priority alerts" : "No active alerts"}
            </div>
            <div class="at__updated">Updated {label}</div>
          </div>

          <div class="dw__divider" />

          {!hasFavorites ? (
            <div class="dw__empty">
              <p>Tap <strong>+</strong> to add a stop</p>
              {gpsStatus === "idle" || gpsStatus === "denied" || gpsStatus === "unavailable" ? (
                <button class="dw__find-btn" onClick={handleFindNearby}>📍 Find nearby stops</button>
              ) : gpsStatus === "locating" ? (
                <span class="dw__nearby-locating">📡 Locating...</span>
              ) : null}
            </div>
          ) : (
            <>
              <div class="dw__stops-header">Favourite Routes</div>
              <div class="dw__stops">
                {favorites.map((fav) => {
                  const key = `${fav.routeId}:${fav.stopCode}`;
                  const vehicles = predictions[key] ?? [];
                  const err = errors[key];
                  const sched = scheduled[key];
                  const nightSched = nightScheduled[key];
                  const tracked = trackedStops.find((t) => t.stopCode === fav.stopCode);
                  const isTracked = !!tracked;
                  const nightId = nightSched ? NIGHT_ROUTE_MAP[String(fav.routeId)] : null;
                  const displayRoute = nightId ?? fav.routeName;
                  const displayColour = nightId ? "#0054a6" : fav.routeColour;
                  return (
                    <div key={key} class="dw__row" style={displayColour ? { "--accent": displayColour } as any : undefined}>
                      {displayColour && <div class="dw__row-accent" />}
                      <div class="dw__row-info">
                        <span class="dw__row-route" style={displayColour ? { color: displayColour } : undefined}>{displayRoute}</span>
                        <span class="dw__row-stop">{fav.stopName}</span>
                      </div>
                      {nightSched ? (
                        <span class="dw__row-sched dw__row-sched--night">🌙 {nightSched.time}</span>
                      ) : (
                        <>
                          {!err && vehicles.length > 0 && <span class="dw__row-dir">{dirBadge(vehicles[0].destination)}</span>}
                          <div class="dw__row-times">
                            {!err && renderArrival(vehicles, err, sched)}
                            {err && <span class="dw__row-error">{err}</span>}
                          </div>
                          {isTracked ? (
                            <button
                              class="dw__row-live"
                              onClick={() => handleUntrack(fav.stopCode)}
                              aria-label="Stop tracking"
                            >
                              LIVE
                            </button>
                          ) : (
                            <button
                              class="dw__row-track-btn"
                              onClick={() => handleTrack(fav.stopCode, fav.stopName, [{ id: fav.routeId, shortName: fav.routeName, colour: fav.routeColour }])}
                              disabled={trackingLoading[fav.stopCode]}
                              aria-label="Track stop"
                            >
                              {trackingLoading[fav.stopCode] ? "…" : "Track"}
                            </button>
                          )}
                        </>
                      )}
                      <button class="dw__row-delete" onClick={() => handleDelete(fav.routeId, fav.stopCode)} aria-label="Remove stop">✕</button>
                    </div>
                  );
                })}
              </div>
              {gpsStatus === "idle" || gpsStatus === "denied" || gpsStatus === "unavailable" ? (
                <button class="dw__find-btn" onClick={handleFindNearby}>📍 Find nearby stops</button>
              ) : null}
            </>
          )}

          {gpsStatus === "locating" && hasFavorites && (
            <div class="dw__nearby-locating">📡 Locating nearby stops...</div>
          )}

          {gpsStatus === "ready" && hasNearby && (
            <div class="dw__nearby">
              <div class="dw__nearby-header">📍 Nearby Stops</div>
              <div class="dw__nearby-list">
                {nearbyStops.map((s) => {
                  const tracked = trackedStops.find((t) => t.stopCode === s.code);
                  const isTracked = !!tracked;
                  return (
                    <div key={s.code} class="dw__nearby-row">
                      <button class="dw__nearby-stop" onClick={() => handleAddNearby(s)}>
                        <div class="dw__nearby-info">
                          <span class="dw__nearby-name">{s.name}</span>
                          <span class="dw__nearby-routes">
                            {nearbyErrors[s.code] ? (
                              <span class="dw__nearby-error">{nearbyErrors[s.code]}</span>
                            ) : (
                              s.routes.slice(0, 4).map((r) => (
                                <button
                                  key={r.shortName}
                                  class="dw__nearby-badge"
                                  style={r.colour ? { color: r.colour } : undefined}
                                  onClick={(e) => { e.stopPropagation(); handleAddNearbyRoute(s, r); }}
                                >
                                  {r.shortName}
                                </button>
                              ))
                            )}
                          </span>
                        </div>
                        {addedStops.has(s.code) ? (
                          <span class="dw__nearby-added">✓ Added</span>
                        ) : (
                          <span class="dw__nearby-dist">{s.distance < 1000 ? `${Math.round(s.distance)}m` : `${(s.distance / 1000).toFixed(1)}km`}</span>
                        )}
                      </button>
                      {isTracked ? (
                        <button
                          class="dw__nr-live"
                          onClick={() => handleUntrack(s.code)}
                          aria-label="Stop tracking"
                        >
                          LIVE
                        </button>
                      ) : (
                        <button
                          class="dw__nr-track-btn"
                          onClick={() => {
                            const routes = s.routes.map((r) => ({ id: parseInt(r.shortName, 10) || r.id, shortName: r.shortName, colour: r.colour }));
                            handleTrack(s.code, s.name, routes);
                          }}
                          disabled={trackingLoading[s.code]}
                          aria-label="Track stop"
                        >
                          {trackingLoading[s.code] ? "…" : "Track"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </WidgetBase>

      {trackedStops.map((ts) => {
        const allArrivals: { minutes: number; destination: string | null; routeName: string; routeColour: string | null; key: string }[] = [];
        for (const r of ts.routes) {
          const key = `${r.id}:${ts.stopCode}`;
          const vehicles = predictions[key] ?? [];
          for (const v of vehicles) {
            allArrivals.push({ minutes: v.minutes, destination: v.destination, routeName: r.shortName, routeColour: r.colour, key });
          }
        }
        allArrivals.sort((a, b) => a.minutes - b.minutes);
        const best = allArrivals[0];

        let schedFallback: { time: string; minutes: number } | null = null;
        if (!best) {
          for (const r of ts.routes) {
            const ns = nightScheduled[`${r.id}:${ts.stopCode}`];
            if (ns) { schedFallback = ns; break; }
          }
          if (!schedFallback) {
            for (const r of ts.routes) {
              const key = `${r.id}:${ts.stopCode}`;
              const s = scheduled[key];
              if (s) { schedFallback = s; break; }
            }
          }
        }

        const isNightFallback = !best && !!nightScheduled[`${ts.routes[0]?.id}:${ts.stopCode}`];
        const nightId = isNightFallback && ts.routes[0] ? NIGHT_ROUTE_MAP[String(ts.routes[0].id)] : null;
        const bestColour = isNightFallback ? "#0054a6" : (best?.routeColour ?? null);
        const bestRouteName = nightId ?? best?.routeName ?? ts.routes[0]?.shortName ?? "?";

        return (
          <WidgetBase key={ts.stopCode} size="large">
            <div class="live" style={bestColour ? { "--live-accent": bestColour } as any : undefined}>
              <div class="live__header">
                <div class="live__header-left">
                  <span class="live__route" style={bestColour ? { color: bestColour } : undefined}>
                    {bestRouteName}
                  </span>
                  {!isNightFallback && best && <span class="live__live-badge">LIVE</span>}
                  {isNightFallback && <span class="live__night-badge">Night</span>}
                  {!isNightFallback && best && <span class="live__dir">{dirBadge(best.destination)}</span>}
                  {ts.routes.length > 1 && (
                    <span class="live__routes-more">+{ts.routes.length - 1}</span>
                  )}
                </div>
                <button class="live__stop" onClick={() => handleUntrack(ts.stopCode)} aria-label="Stop tracking">Stop</button>
              </div>
              <div class="live__stop-name">{ts.stopName}</div>

              {best ? (
                <div class="live__hero">
                  <span class="live__hero-num">{best.minutes}</span>
                  <span class="live__hero-unit">min</span>
                </div>
              ) : schedFallback ? (
                <div class={`live__hero${isNightFallback ? " live__hero--night" : " live__hero--sched"}`}>
                  <span class="live__hero-num">{schedFallback.minutes}</span>
                  <span class="live__hero-unit">min</span>
                  <span class="live__hero-sub">{isNightFallback ? `🌙 ${nightId} Night` : `📍 Scheduled ${schedFallback.time}`}</span>
                </div>
              ) : (
                <div class="live__hero live__hero--none">
                  <span class="live__hero-num">—</span>
                  <span class="live__hero-unit">min</span>
                </div>
              )}

              {best && (
                <div class="live__dest">{best.destination}</div>
              )}

              {allArrivals.length > 1 && (
                <div class="live__routes">
                  {allArrivals.slice(0, 3).map((a, i) => (
                    <div key={i} class="live__route-row">
                      <span class="live__rr-name" style={a.routeColour ? { color: a.routeColour } : undefined}>{a.routeName}</span>
                      <span class="live__rr-time">{a.minutes}<small>m</small></span>
                      <span class="live__rr-dir">{dirBadge(a.destination)}</span>
                      <span class="live__rr-dest">{a.destination}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </WidgetBase>
        );
      })}
      <div class="dw__footer">TTC Tracker v0.2.0-beta.1</div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  );
}
