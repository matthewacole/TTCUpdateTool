import { useState, useEffect, useCallback } from "preact/hooks";
import { WidgetBase } from "./widget-base";
import { preferences, dataCache } from "../store";
import { ttcApi, gtfsRtApi } from "../api";
import { getNextScheduled } from "../api/schedule";
import type { FavoriteStop, TrackedStop, TrackedStopRoute } from "../store";
import type { ServiceAlert, VehicleArrival, Route } from "../types";

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

function dirBadge(dest: string | null): string {
  const d = (dest ?? "").toLowerCase();
  if (d.includes("north")) return "NB";
  if (d.includes("south")) return "SB";
  if (d.includes("east")) return "EB";
  if (d.includes("west")) return "WB";
  return "";
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

export function DashboardWidget({ onAddStop }: DashboardWidgetProps) {
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [trackedStops, setTrackedStops] = useState<TrackedStop[]>([]);
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [predictions, setPredictions] = useState<Record<string, VehicleArrival[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduled, setScheduled] = useState<Record<string, { time: string; minutes: number } | null>>({});
  const [lastFetch, setLastFetch] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [addedStops, setAddedStops] = useState<Set<string>>(new Set);
  const [trackingLoading, setTrackingLoading] = useState<Record<string, boolean>>({});

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
          newPredictions[key] = vehicles;
          if (vehicles.length === 0) {
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
    const ai = setInterval(fetchAlerts, 60000);
    const ti = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(pi); clearInterval(ai); clearInterval(ti); };
  }, [fetchPredictions, fetchAlerts]);

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
            try {
              const routes = await ttcApi.getRoutesByStop(top[i].code);
              top[i].routes = routes;
            } catch {}
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

  const handleAddNearby = async (stop: NearbyStop) => {
    let routes = stop.routes;
    if (routes.length === 0) {
      try {
        routes = await ttcApi.getRoutesByStop(stop.code);
        stop.routes = routes;
      } catch {}
    }
    const route = routes[0];
    if (!route) return;
    const routeId = parseInt(route.shortName, 10) || route.id;
    preferences.addFavorite({ routeId, routeName: route.shortName, routeColour: route.colour, stopCode: stop.code, stopName: stop.name });
    fetchPredictions();
    setAddedStops((prev) => new Set(prev).add(stop.code));
    setTimeout(() => setAddedStops((prev) => { const n = new Set(prev); n.delete(stop.code); return n; }), 2000);
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

  const severe = alerts.filter((a) => a.severity === "SEVERE");
  const warnings = alerts.filter((a) => a.severity === "WARNING");
  const topAlerts = [...severe, ...warnings].slice(0, 3);
  const hasAlerts = topAlerts.length > 0;
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
          <span key={i} class="dw__row-time">{v.minutes}<small>m</small></span>
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
              <button class="dw__add" onClick={onAddStop} aria-label="Add stop">+</button>
            </div>
          </div>

          <div class="dw__alerts">
            <button class="dw__alerts-header" onClick={() => hasAlerts && setAlertsOpen((o) => !o)}>
              <span class="dw__alerts-title">
                Service Alerts
                {alerts.length > 0 && <span class="dw__alerts-count">{alerts.length}</span>}
              </span>
              {hasAlerts && (
                <span class={`dw__alerts-toggle${alertsOpen ? "" : " dw__alerts-toggle--closed"}`}>▾</span>
              )}
            </button>
            {(!hasAlerts || alertsOpen) && (
              <div class="dw__alerts-list">
                {!hasAlerts && <span class="dw__alerts-none">No active alerts</span>}
                {hasAlerts && topAlerts.map((a) => (
                  <div key={a.id} class="dw__alert-item">
                    <span class={["badge", a.severity === "SEVERE" ? "badge--severe" : "badge--warning"].join(" ")}>
                      {a.severity === "SEVERE" ? "Severe" : "Warning"}
                    </span>
                    <span class="dw__alert-text">{a.header}</span>
                  </div>
                ))}
              </div>
            )}
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
              <div class="dw__stops">
                {favorites.map((fav) => {
                  const key = `${fav.routeId}:${fav.stopCode}`;
                  const vehicles = predictions[key] ?? [];
                  const err = errors[key];
                  const sched = scheduled[key];
                  const tracked = trackedStops.find((t) => t.stopCode === fav.stopCode);
                  const isTracked = !!tracked;
                  return (
                    <div key={key} class="dw__row" style={fav.routeColour ? { "--accent": fav.routeColour } as any : undefined}>
                      {fav.routeColour && <div class="dw__row-accent" />}
                      <div class="dw__row-info">
                        <span class="dw__row-route" style={fav.routeColour ? { color: fav.routeColour } : undefined}>{fav.routeName}</span>
                        <span class="dw__row-stop">{fav.stopName}</span>
                      </div>
                      {!err && vehicles.length > 0 && <span class="dw__row-dir">{dirBadge(vehicles[0].destination)}</span>}
                      <div class="dw__row-times">
                        {!err && renderArrival(vehicles, err, sched)}
                        {err && <span class="dw__row-error">{err}</span>}
                      </div>
                      <button
                        class={`dw__row-track${isTracked ? " dw__row-track--active" : ""}`}
                        onClick={() => {
                          if (tracked) { handleUntrack(fav.stopCode); return; }
                          handleTrack(fav.stopCode, fav.stopName, [{ id: fav.routeId, shortName: fav.routeName, colour: fav.routeColour }]);
                        }}
                        aria-label={isTracked ? "Stop tracking" : "Track stop"}
                        disabled={trackingLoading[fav.stopCode]}
                      >
                        {trackingLoading[fav.stopCode] ? "…" : isTracked ? "♫" : "♪"}
                      </button>
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
                            {s.routes.slice(0, 4).map((r) => (
                              <span key={r.shortName} class="dw__nearby-badge" style={r.colour ? { color: r.colour } : undefined}>{r.shortName}</span>
                            ))}
                          </span>
                        </div>
                        {addedStops.has(s.code) ? (
                          <span class="dw__nearby-added">✓ Added</span>
                        ) : (
                          <span class="dw__nearby-dist">{s.distance < 1000 ? `${Math.round(s.distance)}m` : `${(s.distance / 1000).toFixed(1)}km`}</span>
                        )}
                      </button>
                      <button
                        class={`dw__nr-track${isTracked ? " dw__nr-track--active" : ""}`}
                        onClick={() => {
                          if (tracked) { handleUntrack(s.code); return; }
                          const routes = s.routes.map((r) => ({ id: parseInt(r.shortName, 10) || r.id, shortName: r.shortName, colour: r.colour }));
                          handleTrack(s.code, s.name, routes);
                        }}
                        disabled={trackingLoading[s.code]}
                        aria-label={isTracked ? "Stop tracking" : "Track stop"}
                      >
                        {trackingLoading[s.code] ? "…" : isTracked ? "♫" : "♪"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </WidgetBase>

      {alerts.length === 0 ? (
        <WidgetBase size="large">
          <div class="at at--empty">
            <span class="at__check">✓</span>
            <span class="at__empty-text">No active alerts</span>
          </div>
        </WidgetBase>
      ) : (
        <WidgetBase size="large">
          <div class="at">
            <div class="at__header">
              <span>🚨 Service Alerts</span>
              <span class="at__count">{alerts.length}</span>
            </div>
            <div class="at__list">
              {alerts.map((a) => (
                <div key={a.id} class={`at__row at__row--${a.severity.toLowerCase()}`}>
                  <div class="at__row-top">
                    <span class="at__dot" />
                    <span class="at__sev">{a.severity === "SEVERE" ? "Severe" : a.severity === "WARNING" ? "Warning" : "Info"}</span>
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
                    {a.description && <span class="at__desc">{a.description}</span>}
                  </div>
                  <span class="at__time">{relativeTime(a.updatedAt)}</span>
                </div>
              ))}
            </div>
            <div class="at__updated">Updated {label}</div>
          </div>
        </WidgetBase>
      )}

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
            const key = `${r.id}:${ts.stopCode}`;
            const s = scheduled[key];
            if (s) { schedFallback = s; break; }
          }
        }

        const bestColour = best?.routeColour ?? null;

        return (
          <WidgetBase key={ts.stopCode} size="large">
            <div class="live" style={bestColour ? { "--live-accent": bestColour } as any : undefined}>
              <div class="live__header">
                <div class="live__header-left">
                  <span class="live__route" style={bestColour ? { color: bestColour } : undefined}>
                    {best?.routeName ?? ts.routes[0]?.shortName ?? "?"}
                  </span>
                  {best && <span class="live__dir">{dirBadge(best.destination)}</span>}
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
                <div class="live__hero live__hero--sched">
                  <span class="live__hero-num">{schedFallback.minutes}</span>
                  <span class="live__hero-unit">min</span>
                  <span class="live__hero-sub">📍 Scheduled {schedFallback.time}</span>
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
    </>
  );
}
