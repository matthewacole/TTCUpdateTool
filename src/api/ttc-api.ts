import { apiClient, ApiClient } from "./client";
import type { Route, ArrivalPrediction, VehicleArrival, RouteWithDirections, Direction } from "../types";

const TTC_API_BASE = "https://www.ttc.ca/ttcapi/routedetail";

export class TtcApi {
  private client: ApiClient;

  constructor(client: ApiClient = apiClient) {
    this.client = client;
  }

  async getRoute(routeId: number): Promise<RouteWithDirections> {
    const data = await this.client.get<TtcRouteWrapper>(`${TTC_API_BASE}/get`, {
      id: String(routeId),
    });
    return mapRoute(data);
  }

  async getRoutesByStop(stopCode: string): Promise<Route[]> {
    const data = await this.client.get<TtcRouteWrapper[]>(`${TTC_API_BASE}/bystopcode`, {
      stopcode: stopCode,
    });
    return data.map(mapRoute);
  }

  async getNextBuses(routeId: number, stopCode: string): Promise<ArrivalPrediction> {
    const vehicles = await this.client.get<TtcVehicleArrivalRaw[]>(
      `${TTC_API_BASE}/GetNextBuses`,
      { routeId: String(routeId), stopCode },
    );
    return {
      routeId,
      routeName: "",
      routeColour: null,
      stopCode,
      stopName: "",
      vehicles: (vehicles ?? []).map(mapVehicle),
      lastUpdated: Date.now(),
    };
  }
}

interface TtcRouteWrapper {
  route: TtcRouteResponse;
  routeBranchesWithStops: TtcBranch[];
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
  trips: unknown[];
}

interface TtcBranch {
  id: string;
  routeBranch: { id?: string; name?: string };
  routeBranchStops: TtcStopRaw[];
}

interface TtcStopRaw {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface TtcServiceLevel {
  name: string | null;
  description: string | null;
  color: string | null;
  cssClassDashboard: string;
  cssClassConnectingBus: string;
}

interface TtcVehicleArrivalRaw {
  vehicleType: string;
  nextBusMinutes: string;
  crowdingIndex: string;
  destinationSign: string;
  scheduledTime: string;
  isNextDay: boolean;
}

function mapRoute(data: TtcRouteWrapper): RouteWithDirections {
  const r = data.route;
  return {
    id: parseInt(r.shortName, 10) || r.id,
    gtfsId: r.gtfsId,
    agencyId: r.agencyId,
    agency: r.agency,
    shortName: r.shortName,
    longName: r.longName,
    description: r.description,
    type: r.type as Route["type"],
    colour: r.colour,
    textColour: r.textColour,
    active: r.active,
    inService: r.inService,
    direction: r.direction,
    message: r.message,
    is10MinutesNetwork: r.is10MinutesNetwork,
    frequency: r.frequency,
    serviceLevel: r.serviceLevel
      ? {
          name: r.serviceLevel.name,
          description: r.serviceLevel.description,
          color: r.serviceLevel.color,
          cssClassDashboard: r.serviceLevel.cssClassDashboard,
          cssClassConnectingBus: r.serviceLevel.cssClassConnectingBus,
        }
      : null,
    directions: (data.routeBranchesWithStops ?? []).map(mapDirection),
  };
}

function mapDirection(b: TtcBranch): Direction {
  return {
    id: b.id,
    name: b.routeBranch?.name ?? "",
    stops: (b.routeBranchStops ?? []).map((s) => ({
      code: s.code,
      name: s.name,
      lat: s.latitude,
      lon: s.longitude,
    })),
  };
}

function mapVehicle(v: TtcVehicleArrivalRaw): VehicleArrival {
  const mins = parseInt(v.nextBusMinutes ?? "0", 10);
  return {
    vehicleId: `${v.destinationSign}-${v.scheduledTime}`,
    minutes: mins,
    seconds: 0,
    isDeparture: false,
    tripId: null,
    destination: v.destinationSign ?? null,
    delay: null,
    vehicleType: v.vehicleType ?? "",
  };
}

export const ttcApi = new TtcApi();
