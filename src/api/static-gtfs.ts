import { apiClient, ApiClient } from "./client";

export interface StaticRoute {
  routeId: string;
  shortName: string;
  longName: string;
  colour: string;
  textColour: string;
  type: number;
}

export interface StaticStop {
  stopId: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  routeIds: string[];
}

const STATIC_DATA_BASE = "./data";

export class StaticGtfsData {
  private client: ApiClient;
  private baseUrl: string;
  private routes: StaticRoute[] | null = null;
  private stops: StaticStop[] | null = null;

  constructor(client: ApiClient = apiClient, baseUrl: string = STATIC_DATA_BASE) {
    this.client = client;
    this.baseUrl = baseUrl;
  }

  async getRoutes(): Promise<StaticRoute[]> {
    if (this.routes) return this.routes;
    this.routes = await this.client.get<StaticRoute[]>(`${this.baseUrl}/routes.json`);
    return this.routes;
  }

  async getStops(): Promise<StaticStop[]> {
    if (this.stops) return this.stops;
    this.stops = await this.client.get<StaticStop[]>(`${this.baseUrl}/stops.json`);
    return this.stops;
  }

  async getRouteById(routeId: string): Promise<StaticRoute | undefined> {
    const routes = await this.getRoutes();
    return routes.find((r) => r.routeId === routeId);
  }

  async getStopByCode(code: string): Promise<StaticStop | undefined> {
    const stops = await this.getStops();
    return stops.find((s) => s.code === code);
  }

  async searchStops(query: string): Promise<StaticStop[]> {
    const stops = await this.getStops();
    const q = query.toLowerCase();
    return stops.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q),
    );
  }

  async getStopsForRoute(routeId: string): Promise<StaticStop[]> {
    const stops = await this.getStops();
    return stops.filter((s) => s.routeIds.includes(routeId));
  }
}

export const staticGtfs = new StaticGtfsData();
