export interface FavoriteStop {
  routeId: number;
  routeName: string;
  routeColour: string | null;
  stopCode: string;
  stopName: string;
}

export interface UserPreferences {
  favoriteStops: FavoriteStop[];
  theme: "system" | "light" | "dark";
  iconStyle: "default" | "tinted" | "clear";
  refreshInterval: number;
}

const STORAGE_KEY = "ttc:preferences";

const DEFAULTS: UserPreferences = {
  favoriteStops: [],
  theme: "system",
  iconStyle: "default",
  refreshInterval: 30,
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
      this.save();
    }
  }

  removeFavorite(routeId: number, stopCode: string): void {
    this.prefs.favoriteStops = this.prefs.favoriteStops.filter(
      (f) => !(f.routeId === routeId && f.stopCode === stopCode),
    );
    this.save();
  }

  isFavorite(routeId: number, stopCode: string): boolean {
    return this.prefs.favoriteStops.some(
      (f) => f.routeId === routeId && f.stopCode === stopCode,
    );
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
