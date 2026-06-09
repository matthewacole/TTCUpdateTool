import { useState, useEffect } from "preact/hooks";
import { preferences } from "../store";
import type { FavoriteStop } from "../store";
import { ArrivalWidget } from "./arrival-widget";
import { AlertWidget } from "./alert-widget";
import { RoutePicker } from "./route-picker";

export function Dashboard() {
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setFavorites(preferences.get().favoriteStops);
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

  return (
    <div class="dashboard">
      <header class="dashboard__header">
        <h1 class="dashboard__title">TTC Tracker</h1>
        <div class="dashboard__actions">
          <button class="dashboard__add" onClick={() => setShowPicker(true)}>
            <span class="dashboard__add-icon">+</span>
            Add Stop
          </button>
        </div>
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
