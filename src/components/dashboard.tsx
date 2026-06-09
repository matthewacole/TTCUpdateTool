import { useState, useEffect } from "preact/hooks";
import { preferences } from "../store";
import { DashboardWidget } from "./dashboard-widget";
import { RoutePicker } from "./route-picker";

export function Dashboard() {
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    preferences.get();
  }, []);

  const handleAddStop = (routeId: number, routeName: string, routeColour: string | null, stopCode: string, stopName: string) => {
    preferences.addFavorite({ routeId, routeName, routeColour, stopCode, stopName });
    setShowPicker(false);
  };

  return (
    <div class="dashboard">
      <DashboardWidget onAddStop={() => setShowPicker(true)} />
      {showPicker && (
        <RoutePicker
          onSelect={(routeId, routeName, routeColour, stopCode, stopName) => handleAddStop(routeId, routeName, routeColour, stopCode, stopName)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
