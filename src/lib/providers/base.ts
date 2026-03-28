import { Point, RouteQuote, TravelMode } from "@/lib/types";

export interface RouteProvider {
  quote(origin: Point, destination: Point, mode: TravelMode): Promise<RouteQuote>;
}
