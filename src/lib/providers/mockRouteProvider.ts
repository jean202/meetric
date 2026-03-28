import { Point, RouteQuote, TravelMode } from "@/lib/types";
import { RouteProvider } from "@/lib/providers/base";

function haversineDistanceMeters(a: Point, b: Point): number {
  const R = 6371000;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

const speedByModeMps: Record<TravelMode, number> = {
  car: 10.5,
  transit: 6.4,
  bike: 4.2,
  walk: 1.25
};

const distanceMultiplierByMode: Record<TravelMode, number> = {
  car: 1.33,
  transit: 1.42,
  bike: 1.2,
  walk: 1.14
};

export class MockRouteProvider implements RouteProvider {
  async quote(origin: Point, destination: Point, mode: TravelMode): Promise<RouteQuote> {
    const straight = haversineDistanceMeters(origin, destination);
    const networkDistance = straight * distanceMultiplierByMode[mode];
    const baseDuration = networkDistance / speedByModeMps[mode];
    const randomized = baseDuration * (0.95 + Math.random() * 0.15);

    return {
      mode,
      durationSec: Math.round(randomized),
      distanceM: Math.round(networkDistance),
      fareKRW: mode === "transit" ? Math.max(1400, Math.round(networkDistance / 400)) : undefined,
      provider: "mock"
    };
  }
}
