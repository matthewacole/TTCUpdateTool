import { useState, useEffect } from "preact/hooks";
import { preferences } from "../store";
import { gtfsRtApi } from "../api";
import type { FavoriteStop } from "../store";
import { ArrivalWidget } from "./arrival-widget";
import { AlertWidget } from "./alert-widget";
import { RoutePicker } from "./route-picker";

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function Dashboard() {
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    setFavorites(preferences.get().favoriteStops);
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        const idx = await gtfsRtApi.getCacheIndex();
        if (idx?.updatedAt) setLastUpdated(idx.updatedAt);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, []);

  const refreshFavorites = () => {
    setFavorites([...preferences.get().favoriteStops]);
  };

  const handleAddStop = (routeId: number, stopCode: string, stopName: string) => {
    const route = favorites.find((f) => f.routeId === routeId);
    preferences.addFavorite({
      routeId,
      routeName: route?.routeName ?? String(routeId),
      routeColour: route?.routeColour ?? null,
      stopCode,
      stopName,
    });
    refreshFavorites();
    setShowPicker(false);
  };

  const handleDeleteStop = (routeId: number, stopCode: string) => {
    preferences.removeFavorite(routeId, stopCode);
    refreshFavorites();
  };

  return (
    <div class="dashboard">
      <header class="dashboard__header">
        <div class="dashboard__header-top">
          <h1 class="dashboard__title">TTC Tracker</h1>
          <div class="dashboard__actions">
            <button class="dashboard__add" onClick={() => setShowPicker(true)}>
              <span class="dashboard__add-icon">+</span>
              Add Stop
            </button>
          </div>
        </div>
        {lastUpdated && (
          <span class="dashboard__updated">Updated {timeAgo(lastUpdated)}</span>
        )}
      </header>

      <div class="dashboard__grid">
        <AlertWidget />
        {favorites.length === 0 && (
          <div class="dashboard__empty">
            <p>Tap "Add Stop" to track a bus or streetcar route.</p>
          </div>
        )}
        {favorites.map((fav) => (
          <ArrivalWidget
            key={`${fav.routeId}:${fav.stopCode}`}
            routeId={fav.routeId}
            routeName={fav.routeName}
            routeColour={fav.routeColour}
            stopCode={fav.stopCode}
            stopName={fav.stopName}
            onDelete={handleDeleteStop}
          />
        ))}
      </div>

      {showPicker && (
        <RoutePicker
          onSelect={(routeId, stopCode, stopName) =>
            handleAddStop(routeId, stopCode, stopName)
          }
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
