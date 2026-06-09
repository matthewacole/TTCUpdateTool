export interface FavoriteStop {
  routeId: number;
  routeName: string;
  routeColour: string | null;
  stopCode: string;
  stopName: string;
}

export interface TrackedStopRoute {
  id: number;
  shortName: string;
  colour: string | null;
}

export interface TrackedStop {
  stopCode: string;
  stopName: string;
  routes: TrackedStopRoute[];
}

export type AlertFilterMode = "all" | "priority";

export interface UserPreferences {
  favoriteStops: FavoriteStop[];
  trackedStops: TrackedStop[];
  theme: "system" | "light" | "dark";
  iconStyle: "default" | "tinted" | "clear";
  refreshInterval: number;
  alertFilterMode: AlertFilterMode;
  priorityRoutes: number[];
}

const STORAGE_KEY = "ttc:preferences";

const DEFAULTS: UserPreferences = {
  favoriteStops: [],
  trackedStops: [],
  theme: "system",
  iconStyle: "default",
  refreshInterval: 30,
  alertFilterMode: "all",
  priorityRoutes: [],
};

export class PreferencesStore {
  private prefs: UserPreferences;

  constructor() {
    this.prefs = this.load();
  }

  get(): UserPreferences {
    return { ...this.prefs };
  }

  update(partial: Partial<UserPreferences>): UserPreferences {
    this.prefs = { ...this.prefs, ...partial };
    this.save();
    return this.get();
  }

  addFavorite(stop: FavoriteStop): void {
    const exists = this.prefs.favoriteStops.some(
      (f) => f.routeId === stop.routeId && f.stopCode === stop.stopCode,
    );
    if (!exists) {
      this.prefs.favoriteStops.push(stop);
      this.addPriorityRoute(stop.routeId);
      this.save();
    }
  }

  removeFavorite(routeId: number, stopCode: string): void {
    this.prefs.favoriteStops = this.prefs.favoriteStops.filter(
      (f) => !(f.routeId === routeId && f.stopCode === stopCode),
    );
    this.save();
    this.cleanupPriorityRoutes();
  }

  isFavorite(routeId: number, stopCode: string): boolean {
    return this.prefs.favoriteStops.some(
      (f) => f.routeId === routeId && f.stopCode === stopCode,
    );
  }

  addTrackedStop(stop: TrackedStop): void {
    const exists = this.prefs.trackedStops.some((t) => t.stopCode === stop.stopCode);
    if (!exists) {
      this.prefs.trackedStops.push(stop);
      this.save();
    }
  }

  removeTrackedStop(stopCode: string): void {
    this.prefs.trackedStops = this.prefs.trackedStops.filter(
      (t) => t.stopCode !== stopCode,
    );
    this.save();
    this.cleanupPriorityRoutes();
  }

  isTracked(stopCode: string): boolean {
    return this.prefs.trackedStops.some((t) => t.stopCode === stopCode);
  }

  toggleTracked(stop: TrackedStop): boolean {
    const exists = this.prefs.trackedStops.some((t) => t.stopCode === stop.stopCode);
    if (exists) {
      this.removeTrackedStop(stop.stopCode);
      return false;
    } else {
      this.addTrackedStop(stop);
      for (const r of stop.routes) {
        this.addPriorityRoute(r.id);
      }
      return true;
    }
  }

  setAlertFilterMode(mode: AlertFilterMode): void {
    this.prefs.alertFilterMode = mode;
    this.save();
  }

  addPriorityRoute(id: number): void {
    if (!this.prefs.priorityRoutes.includes(id)) {
      this.prefs.priorityRoutes.push(id);
      this.save();
    }
  }

  removePriorityRoute(id: number): void {
    this.prefs.priorityRoutes = this.prefs.priorityRoutes.filter((r) => r !== id);
    this.save();
  }

  isPriorityRoute(id: number): boolean {
    return this.prefs.priorityRoutes.includes(id);
  }

  togglePriorityRoute(id: number): boolean {
    if (this.isPriorityRoute(id)) {
      this.removePriorityRoute(id);
      return false;
    } else {
      this.addPriorityRoute(id);
      return true;
    }
  }

  getPriorityRouteIds(): number[] {
    const subwayIds = [1, 2, 3, 4, 5];
    const merged = new Set([...subwayIds, ...this.prefs.priorityRoutes]);
    return Array.from(merged);
  }

  private cleanupPriorityRoutes(): void {
    const active = new Set<number>();
    for (const f of this.prefs.favoriteStops) {
      active.add(f.routeId);
    }
    for (const t of this.prefs.trackedStops) {
      for (const r of t.routes) {
        active.add(r.id);
      }
    }
    this.prefs.priorityRoutes = this.prefs.priorityRoutes.filter((id) => active.has(id));
    this.save();
  }

  getEffectiveTheme(): "light" | "dark" {
    if (this.prefs.theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return this.prefs.theme;
  }

  private load(): UserPreferences {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULTS, ...parsed };
      }
    } catch {
    }
    return { ...DEFAULTS };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
    }
  }
}

export const preferences = new PreferencesStore();
