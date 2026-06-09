import { useState, useEffect, useCallback } from "preact/hooks";
import { WidgetBase } from "./widget-base";
import { preferences, dataCache } from "../store";
import { ttcApi, gtfsRtApi } from "../api";
import type { FavoriteStop } from "../store";
import type { ServiceAlert, VehicleArrival } from "../types";

interface DashboardWidgetProps {
  onAddStop: () => void;
}

function dirBadge(dest: string | null): string {
  const d = (dest ?? "").toLowerCase();
  if (d.includes("north")) return "NB";
  if (d.includes("south")) return "SB";
  if (d.includes("east")) return "EB";
  if (d.includes("west")) return "WB";
  return "";
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function DashboardWidget({ onAddStop }: DashboardWidgetProps) {
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [predictions, setPredictions] = useState<Record<string, VehicleArrival[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(true);

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
          setErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const cached = dataCache.getAlerts();
      if (cached) {
        setAlerts(cached);
        return;
      }
      const data = await gtfsRtApi.getAlerts();
      dataCache.setAlerts(data);
      setAlerts(data);
    } catch {
    }
  }, []);

  const fetchIndex = useCallback(async () => {
    try {
      const idx = await gtfsRtApi.getCacheIndex();
      if (idx?.updatedAt) setLastUpdated(idx.updatedAt);
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchPredictions();
    fetchAlerts();
    fetchIndex();
    const pi = setInterval(fetchPredictions, 30000);
    const ai = setInterval(fetchAlerts, 60000);
    const ii = setInterval(fetchIndex, 30000);
    return () => { clearInterval(pi); clearInterval(ai); clearInterval(ii); };
  }, [fetchPredictions, fetchAlerts, fetchIndex]);

  const handleDelete = (routeId: number, stopCode: string) => {
    preferences.removeFavorite(routeId, stopCode);
    setFavorites([...preferences.get().favoriteStops]);
    const key = `${routeId}:${stopCode}`;
    setPredictions((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const severe = alerts.filter((a) => a.severity === "SEVERE");
  const warnings = alerts.filter((a) => a.severity === "WARNING");
  const topAlerts = [...severe, ...warnings].slice(0, 3);

  return (
    <WidgetBase size="large">
      <div class="dw">
        <div class="dw__header">
          <span class="dw__title">TTC Tracker</span>
          <div class="dw__header-right">
            {lastUpdated && <span class="dw__updated">{timeAgo(lastUpdated)}</span>}
            <button class="dw__add" onClick={onAddStop} aria-label="Add stop">+</button>
          </div>
        </div>

        {topAlerts.length > 0 && (
          <div class="dw__alerts">
            <button class="dw__alerts-header" onClick={() => setAlertsOpen((o) => !o)}>
              <span class="dw__alerts-title">
                Service Alerts
                <span class="dw__alerts-count">{alerts.length}</span>
              </span>
              <span class={`dw__alerts-toggle${alertsOpen ? "" : " dw__alerts-toggle--closed"}`}>
                ▾
              </span>
            </button>
            {alertsOpen && (
              <div class="dw__alerts-list">
                {topAlerts.map((a) => (
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
        )}

        {topAlerts.length > 0 && favorites.length > 0 && <div class="dw__divider" />}

        {favorites.length === 0 ? (
          <div class="dw__empty">
            <p>Tap <strong>+</strong> to add a stop</p>
          </div>
        ) : (
          <div class="dw__stops">
            {favorites.map((fav) => {
              const key = `${fav.routeId}:${fav.stopCode}`;
              const vehicles = predictions[key] ?? [];
              const err = errors[key];
              return (
                <div key={key} class="dw__row" style={fav.routeColour ? { "--accent": fav.routeColour } as any : undefined}>
                  {fav.routeColour && <div class="dw__row-accent" />}
                  <div class="dw__row-info">
                    <span class="dw__row-route" style={fav.routeColour ? { color: fav.routeColour } : undefined}>
                      {fav.routeName}
                    </span>
                    <span class="dw__row-stop">{fav.stopName}</span>
                  </div>
                  {!err && vehicles.length > 0 && (
                    <span class="dw__row-dir">{dirBadge(vehicles[0].destination)}</span>
                  )}
                  <div class="dw__row-times">
                    {err && <span class="dw__row-error">{err}</span>}
                    {!err && vehicles.length === 0 && <span class="dw__row-none">—</span>}
                    {!err && vehicles.slice(0, 3).map((v, i) => (
                      <span key={i} class="dw__row-time">
                        {v.minutes}<small>m</small>
                      </span>
                    ))}
                    {!err && vehicles.length > 3 && (
                      <span class="dw__row-more">+{vehicles.length - 3}</span>
                    )}
                  </div>
                  <button class="dw__row-delete" onClick={() => handleDelete(fav.routeId, fav.stopCode)} aria-label="Remove stop">✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WidgetBase>
  );
}
