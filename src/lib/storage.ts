import type { Point, TravelMode } from "./types";

const STORAGE_KEY = "meetric:participants";

export type SavedParticipant = {
  id: string;
  name: string;
  originLabel?: string;
  point?: Point;
  mode: TravelMode;
};

export function loadParticipants(): SavedParticipant[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function saveParticipants(participants: SavedParticipant[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(participants));
  } catch {
    // storage full or unavailable — silently ignore
  }
}
