export type TravelMode = "car" | "transit" | "bike" | "walk";
export type RouteFallbackReason = "missing_api_key" | "provider_error";

export interface Point {
  lat: number;
  lng: number;
}

export interface ParticipantInput {
  id: string;
  name: string;
  origin: Point;
  mode: TravelMode;
}

export interface PlaceCandidate {
  id: string;
  name: string;
  point: Point;
  category?: string;
}

export interface RouteQuote {
  mode: TravelMode;
  durationSec: number;
  distanceM: number;
  fareKRW?: number;
  provider: "tmap" | "kakaomobility" | "google" | "mock";
  isFallback?: boolean;
  fallbackReason?: RouteFallbackReason;
}

export interface ParticipantRoute {
  participantId: string;
  participantName: string;
  route: RouteQuote;
}

export interface RecommendationItem {
  place: PlaceCandidate;
  score: number;
  maxDurationSec: number;
  totalDurationSec: number;
  details: ParticipantRoute[];
}

export interface RecommendRequest {
  participants: ParticipantInput[];
  candidates: PlaceCandidate[];
  topK?: number;
}

export interface RecommendResponse {
  recommendations: RecommendationItem[];
}
