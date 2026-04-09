import { describe, it, expect } from "vitest";
import {
  formatDuration,
  haversineDistanceMeters,
  getCandidateSearchParams,
  buildShareText,
  getRecommendationHint,
} from "../utils";
import type { RecommendationItem } from "@/lib/types";

describe("formatDuration", () => {
  it("formats seconds to minutes", () => {
    expect(formatDuration(300)).toBe("5분");
  });

  it("shows at least 1 minute", () => {
    expect(formatDuration(10)).toBe("1분");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(5400)).toBe("1시간 30분");
  });

  it("formats exact hours", () => {
    expect(formatDuration(7200)).toBe("2시간");
  });
});

describe("haversineDistanceMeters", () => {
  it("returns 0 for same point", () => {
    const p = { lat: 37.5665, lng: 126.978 };
    expect(haversineDistanceMeters(p, p)).toBe(0);
  });

  it("calculates reasonable distance between Seoul and Gwangmyeong", () => {
    const seoul = { lat: 37.5665, lng: 126.978 };
    const gwangmyeong = { lat: 37.4783, lng: 126.8645 };
    const distance = haversineDistanceMeters(seoul, gwangmyeong);
    expect(distance).toBeGreaterThan(10000);
    expect(distance).toBeLessThan(20000);
  });
});

describe("getCandidateSearchParams", () => {
  it("calculates center and radius from participants", () => {
    const participants = [
      { id: "1", name: "A", origin: { lat: 37.5, lng: 127.0 }, mode: "transit" as const },
      { id: "2", name: "B", origin: { lat: 37.6, lng: 127.0 }, mode: "transit" as const },
    ];
    const { center, radius } = getCandidateSearchParams(participants);

    expect(center.lat).toBeCloseTo(37.55, 1);
    expect(center.lng).toBeCloseTo(127.0, 1);
    expect(radius).toBeGreaterThan(1800);
    expect(radius).toBeLessThanOrEqual(8000);
  });
});

describe("buildShareText", () => {
  it("builds share text from recommendation", () => {
    const recommendation: RecommendationItem = {
      place: { id: "p1", name: "강남역", point: { lat: 37.498, lng: 127.028 } },
      score: 1000,
      maxDurationSec: 1800,
      totalDurationSec: 3000,
      details: [
        { participantId: "1", participantName: "진하", route: { mode: "transit", durationSec: 1200, distanceM: 5000, provider: "google" } },
        { participantId: "2", participantName: "수연", route: { mode: "transit", durationSec: 1800, distanceM: 8000, provider: "google" } },
      ],
    };

    const text = buildShareText(recommendation, 2);

    expect(text).toContain("강남역");
    expect(text).toContain("참여자 2명");
    expect(text).toContain("진하: 20분");
    expect(text).toContain("수연: 30분");
  });
});

describe("getRecommendationHint", () => {
  it("shows candidate count when available", () => {
    const hint = getRecommendationHint({ candidateCount: 8, candidateFallback: false });
    expect(hint).toContain("8곳");
  });

  it("shows fallback message", () => {
    const hint = getRecommendationHint({ candidateCount: 5, candidateFallback: true });
    expect(hint).toContain("중심점 주변");
  });

  it("shows prompt when no candidates", () => {
    const hint = getRecommendationHint({ candidateCount: 0, candidateFallback: false });
    expect(hint).toContain("출발지를 2곳 이상");
  });
});
