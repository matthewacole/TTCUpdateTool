import { useState, useEffect, useCallback } from "preact/hooks";
import { WidgetBase } from "./widget-base";
import { preferences, dataCache } from "../store";
import { ttcApi, gtfsRtApi } from "../api";
import type { FavoriteStop } from "../store";
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
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [predictions, setPredictions] = useState<Record<string, VehicleArrival[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastFetch, setLastFetch] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [addedStops, setAddedStops] = useState<Set<string>>(new Set());

  const fetchPredictions = useCallback(async () => {
    const favs = preferences.get().favoriteStops;
    setFavorites(favs);
    const results = await Promise.allSettled(
      favs.map(async (fav) => {
        const key = `${fav.routeId}:${fav.stopCode}`;
        try {
          const cached = dataCache.getPredictions(fav.routeId, fav.stopCode);
          if (cached) return { key, vehicles: cached.vehicles, error: null };
          const data = await ttcApi.getNextBuses(fav.routeId, fav.stopCode);
          dataCache.setPredictions(data);
          return { key, vehicles: data.vehicles, error: null };
        } catch (err) {
          return { key, vehicles: [], error: err instanceof Error ? err.message : "Failed" };
        }
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        const { key, vehicles, error } = result.value;
        if (error) {
          setErrors((prev) => ({ ...prev, [key]: error }));
        } else {
          setPredictions((prev) => ({ ...prev, [key]: vehicles }));
          setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
        }
      }
    }
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

  const severe = alerts.filter((a) => a.severity === "SEVERE");
  const warnings = alerts.filter((a) => a.severity === "WARNING");
  const topAlerts = [...severe, ...warnings].slice(0, 3);
  const hasAlerts = topAlerts.length > 0;
  const hasFavorites = favorites.length > 0;
  const hasNearby = nearbyStops.length > 0;
  const sinceSec = Math.floor((now - lastFetch) / 1000);
  const label = sinceSec < 60 ? `${sinceSec}s ago` : `${Math.floor(sinceSec / 60)}m ago`;

  return (
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
                return (
                  <div key={key} class="dw__row" style={fav.routeColour ? { "--accent": fav.routeColour } as any : undefined}>
                    {fav.routeColour && <div class="dw__row-accent" />}
                    <div class="dw__row-info">
                      <span class="dw__row-route" style={fav.routeColour ? { color: fav.routeColour } : undefined}>{fav.routeName}</span>
                      <span class="dw__row-stop">{fav.stopName}</span>
                    </div>
                    {!err && vehicles.length > 0 && <span class="dw__row-dir">{dirBadge(vehicles[0].destination)}</span>}
                    <div class="dw__row-times">
                      {err && <span class="dw__row-error">{err}</span>}
                      {!err && vehicles.length === 0 && <span class="dw__row-none">—</span>}
                      {!err && vehicles.slice(0, 3).map((v, i) => (
                        <span key={i} class="dw__row-time">{v.minutes}<small>m</small></span>
                      ))}
                      {!err && vehicles.length > 3 && <span class="dw__row-more">+{vehicles.length - 3}</span>}
                    </div>
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
              {nearbyStops.map((s) => (
                <button key={s.code} class="dw__nearby-stop" onClick={() => handleAddNearby(s)}>
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
              ))}
            </div>
          </div>
        )}
      </div>
    </WidgetBase>
  );
}
