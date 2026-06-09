export interface Route {
  id: number;
  gtfsId: string;
  agencyId: number;
  agency: string | null;
  shortName: string;
  longName: string;
  description: string;
  type: RouteType;
  colour: string | null;
  textColour: string | null;
  active: boolean;
  inService: boolean;
  direction: number;
  serviceLevel: ServiceLevel | null;
  frequency: string | null;
  message: string | null;
  is10MinutesNetwork: boolean;
}

export enum RouteType {
  Tram = 0,
  Subway = 1,
  Rail = 2,
  Bus = 3,
  Ferry = 4,
}

export interface ServiceLevel {
  name: string | null;
  description: string | null;
  color: string | null;
  cssClassDashboard: string;
  cssClassConnectingBus: string;
}

export interface Stop {
  code: string;
  name: string;
  lat: number;
  lon: number;
  routes?: Route[];
}

export interface Direction {
  id: string;
  name: string;
  stops: Stop[];
}

export interface RouteWithDirections extends Route {
  directions: Direction[];
}
