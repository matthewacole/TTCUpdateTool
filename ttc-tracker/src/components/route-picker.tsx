import { useState, useCallback } from "preact/hooks";
import { ttcApi } from "../api";
import { ALL_ROUTES } from "../data/routes-list";
import type { RouteInfo } from "../data/routes-list";
import type { RouteWithDirections } from "../types";

interface RoutePickerProps {
  onSelect: (routeId: number, stopCode: string, stopName: string) => void;
  onClose: () => void;
}

type Tab = "search" | "browse";

const ROUTE_TYPE_LABELS: Record<RouteInfo["type"], string> = {
  subway: "Subway",
  streetcar: "Streetcar",
  bus: "Bus",
  express: "Express",
  night: "Blue Night",
};

const ROUTE_TYPE_ORDER: RouteInfo["type"][] = ["subway", "streetcar", "bus", "express", "night"];

function dirArrow(name: string): string {
  const n = name.toLowerCase();
  if (/north/i.test(n)) return "\u2191";
  if (/south/i.test(n)) return "\u2193";
  if (/east/i.test(n)) return "\u2192";
  if (/west/i.test(n)) return "\u2190";
  return "";
}

export function RoutePicker({ onSelect, onClose }: RoutePickerProps) {
  const [tab, setTab] = useState<Tab>("search");
  const [routeIdInput, setRouteIdInput] = useState("");
  const [route, setRoute] = useState<RouteWithDirections | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseFilter, setBrowseFilter] = useState("");

  const fetchRoute = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await ttcApi.getRoute(id);
      setRoute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Route not found");
      setRoute(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const id = parseInt(routeIdInput, 10);
    if (!isNaN(id)) {
      fetchRoute(id);
    }
  };

  const handleBrowseRoute = (info: RouteInfo) => {
    const id = parseInt(info.shortName, 10);
    if (!isNaN(id)) {
      setRouteIdInput(info.shortName);
      setTab("search");
      fetchRoute(id);
    }
  };

  const grouped = ROUTE_TYPE_ORDER.map((type) => ({
    type,
    label: ROUTE_TYPE_LABELS[type],
    routes: ALL_ROUTES.filter((r) => {
      if (r.type !== type) return false;
      if (!browseFilter) return true;
      const q = browseFilter.toLowerCase();
      return r.shortName.includes(q) || r.longName.toLowerCase().includes(q);
    }),
  })).filter((g) => g.routes.length > 0);

  return (
    <div class="overlay" onClick={onClose}>
      <div class="route-picker" onClick={(e) => e.stopPropagation()}>
        <div class="route-picker__header">
          <h2 class="route-picker__title">Add Stop</h2>
          <button class="route-picker__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div class="route-picker__tabs">
          <button
            class={`route-picker__tab${tab === "search" ? " route-picker__tab--active" : ""}`}
            onClick={() => setTab("search")}
          >
            Search
          </button>
          <button
            class={`route-picker__tab${tab === "browse" ? " route-picker__tab--active" : ""}`}
            onClick={() => setTab("browse")}
          >
            Browse
          </button>
        </div>

        {tab === "search" && (
          <>
            <form class="route-picker__form" onSubmit={handleSubmit}>
              <input
                class="route-picker__input"
                type="number"
                placeholder="Route number (e.g. 510)"
                value={routeIdInput}
                onInput={(e) => setRouteIdInput((e.target as HTMLInputElement).value)}
                autoFocus
              />
              <button class="route-picker__search" type="submit" disabled={loading}>
                {loading ? "Loading..." : "Search"}
              </button>
            </form>

            {error && <p class="route-picker__error">{error}</p>}

            {route && (
              <div class="route-picker__results">
                <div class="route-picker__route-info">
                  <span class="route-picker__route-name" style={route.colour ? { color: route.colour } : undefined}>
                    {route.shortName}
                  </span>
                  <span class="route-picker__route-long">{route.longName}</span>
                </div>
                {route.directions.map((dir) => {
                  const arrow = dirArrow(dir.name);
                  return (
                    <div key={dir.id} class="route-picker__direction">
                      <h3 class="route-picker__dir-name">
                        {arrow && <span class="route-picker__dir-arrow">{arrow}</span>}
                        {dir.name}
                      </h3>
                      <div class="route-picker__stops">
                        {dir.stops.map((stop) => (
                          <button
                            key={stop.code}
                            class="route-picker__stop"
                            onClick={() => onSelect(route.id, stop.code, stop.name)}
                          >
                            <span class="route-picker__stop-code">{stop.code}</span>
                            <span class="route-picker__stop-name">{stop.name}</span>
                            {arrow && <span class="route-picker__stop-dir">{arrow}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "browse" && (
          <div class="route-picker__browse">
            <div class="route-picker__browse-filter">
              <input
                class="route-picker__input"
                type="text"
                placeholder="Filter routes..."
                value={browseFilter}
                onInput={(e) => setBrowseFilter((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="route-picker__browse-list">
              {grouped.map((g) => (
                <div key={g.type} class="route-picker__browse-group">
                  <h3 class="route-picker__browse-label">{g.label}</h3>
                  <div class="route-picker__browse-routes">
                    {g.routes.map((r) => (
                      <button
                        key={r.shortName}
                        class="route-picker__browse-route"
                        onClick={() => handleBrowseRoute(r)}
                        style={{ "--route-color": `#${r.color}` } as any}
                      >
                        <span class="route-picker__browse-badge">{r.shortName}</span>
                        <span class="route-picker__browse-name">{r.longName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
