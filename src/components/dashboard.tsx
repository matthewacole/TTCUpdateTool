import { useState, useEffect } from "preact/hooks";
import { preferences } from "../store";
import { DashboardWidget } from "./dashboard-widget";
import { RoutePicker } from "./route-picker";

export function Dashboard() {
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    preferences.get();
  }, []);

  const handleAddStop = (routeId: number, stopCode: string, stopName: string) => {
    const favs = preferences.get().favoriteStops;
    const route = favs.find((f) => f.routeId === routeId);
    preferences.addFavorite({
      routeId,
      routeName: route?.routeName ?? String(routeId),
      routeColour: route?.routeColour ?? null,
      stopCode,
      stopName,
    });
    setShowPicker(false);
  };

  return (
    <div class="dashboard">
      <DashboardWidget onAddStop={() => setShowPicker(true)} />
      {showPicker && (
        <RoutePicker
          onSelect={(routeId, stopCode, stopName) => handleAddStop(routeId, stopCode, stopName)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
