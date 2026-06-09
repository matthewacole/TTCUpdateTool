import { apiClient, ApiClient } from "./client";
import type { Route, ArrivalPrediction, VehicleArrival, RouteWithDirections, Direction } from "../types";

const TTC_API_BASE = "https://www.ttc.ca/ttcapi/routedetail";

export class TtcApi {
  private client: ApiClient;

  constructor(client: ApiClient = apiClient) {
    this.client = client;
  }

  async getRoute(routeId: number): Promise<RouteWithDirections> {
    const data = await this.client.get<TtcRouteResponse>(`${TTC_API_BASE}/get`, {
      id: String(routeId),
    });
    return mapRoute(data);
  }

  async getRoutesByStop(stopCode: string): Promise<Route[]> {
    const data = await this.client.get<TtcRouteResponse[]>(`${TTC_API_BASE}/bystopcode`, {
      stopcode: stopCode,
    });
    return data.map(mapRoute);
  }

  async getNextBuses(routeId: number, stopCode: string): Promise<ArrivalPrediction> {
    const data = await this.client.get<TtcNextBusesResponse>(
      `${TTC_API_BASE}/GetNextBuses`,
      { routeId: String(routeId), stopCode },
    );
    return {
      routeId,
      routeName: data.routeName ?? "",
      routeColour: data.routeColour ?? null,
      stopCode,
      stopName: data.stopName ?? "",
      vehicles: (data.vehicles ?? []).map(mapVehicle),
      lastUpdated: Date.now(),
    };
  }
}

interface TtcRouteResponse {
  id: number;
  gtfsId: string;
  agencyId: number;
  agency: string | null;
  shortName: string;
  longName: string;
  description: string;
  type: number;
  colour: string | null;
  textColour: string | null;
  active: boolean;
  inService: boolean;
  direction: number;
  message: string | null;
  is10MinutesNetwork: boolean;
  frequency: string | null;
  serviceLevel: TtcServiceLevel | null;
  directions?: TtcDirection[];
}

interface TtcDirection {
  id: string;
  name: string;
  stops?: TtcStop[];
}

interface TtcStop {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

interface TtcServiceLevel {
  name: string | null;
  description: string | null;
  color: string | null;
  cssClassDashboard: string;
  cssClassConnectingBus: string;
}

interface TtcNextBusesResponse {
  routeName?: string;
  routeColour?: string;
  stopName?: string;
  vehicles?: TtcVehicleArrival[];
}

interface TtcVehicleArrival {
  vehicleId?: string;
  minutes?: number;
  seconds?: number;
  isDeparture?: boolean;
  tripId?: string;
  destination?: string;
  delay?: number;
}

function mapRoute(data: TtcRouteResponse): RouteWithDirections {
  return {
    id: data.id,
    gtfsId: data.gtfsId,
    agencyId: data.agencyId,
    agency: data.agency,
    shortName: data.shortName,
    longName: data.longName,
    description: data.description,
    type: data.type as Route["type"],
    colour: data.colour,
    textColour: data.textColour,
    active: data.active,
    inService: data.inService,
    direction: data.direction,
    message: data.message,
    is10MinutesNetwork: data.is10MinutesNetwork,
    frequency: data.frequency,
    serviceLevel: data.serviceLevel
      ? {
          name: data.serviceLevel.name,
          description: data.serviceLevel.description,
          color: data.serviceLevel.color,
          cssClassDashboard: data.serviceLevel.cssClassDashboard,
          cssClassConnectingBus: data.serviceLevel.cssClassConnectingBus,
        }
      : null,
    directions: (data.directions ?? []).map(mapDirection),
  };
}

function mapDirection(d: TtcDirection): Direction {
  return {
    id: d.id,
    name: d.name,
    stops: (d.stops ?? []).map((s) => ({
      code: s.code,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
    })),
  };
}

function mapVehicle(v: TtcVehicleArrival): VehicleArrival {
  return {
    vehicleId: v.vehicleId ?? "",
    minutes: v.minutes ?? 0,
    seconds: v.seconds ?? 0,
    isDeparture: v.isDeparture ?? false,
    tripId: v.tripId ?? null,
    destination: v.destination ?? null,
    delay: v.delay ?? null,
  };
}

export const ttcApi = new TtcApi();
