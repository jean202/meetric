import type { Point, TravelMode } from "@/lib/types";

export type ParticipantDraft = {
  id: string;
  name: string;
  originLabel?: string;
  point?: Point;
  mode: TravelMode;
};

export type PlaceSuggestion = {
  id: string;
  name: string;
  address?: string;
  point: Point;
};

export type Screen = "map" | "origin" | "newParticipant";

export const DEFAULT_MAP_CENTER: Point = { lat: 37.5665, lng: 126.978 };
export const DEFAULT_TRAVEL_MODE: TravelMode = "transit";
