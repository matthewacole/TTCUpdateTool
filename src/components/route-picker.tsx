import { useState, useCallback } from "preact/hooks";
import { ttcApi } from "../api";
import type { RouteWithDirections } from "../types";

interface RoutePickerProps {
  onSelect: (routeId: number, stopCode: string, stopName: string) => void;
  onClose: () => void;
}

export function RoutePicker({ onSelect, onClose }: RoutePickerProps) {
  const [routeIdInput, setRouteIdInput] = useState("");
  const [route, setRoute] = useState<RouteWithDirections | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div class="overlay" onClick={onClose}>
      <div class="route-picker" onClick={(e) => e.stopPropagation()}>
        <div class="route-picker__header">
          <h2 class="route-picker__title">Add Stop</h2>
          <button class="route-picker__close" onClick={onClose}>
            ✕
          </button>
        </div>

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
            {route.directions.map((dir) => (
              <div key={dir.id} class="route-picker__direction">
                <h3 class="route-picker__dir-name">{dir.name}</h3>
                <div class="route-picker__stops">
                  {dir.stops.map((stop) => (
                    <button
                      key={stop.code}
                      class="route-picker__stop"
                      onClick={() => onSelect(route.id, stop.code, stop.name)}
                    >
                      <span class="route-picker__stop-code">{stop.code}</span>
                      <span class="route-picker__stop-name">{stop.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
