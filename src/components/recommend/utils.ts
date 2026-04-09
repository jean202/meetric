import type { ParticipantInput, Point, RecommendationItem } from "@/lib/types";

export function makeId() {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}

export function haversineDistanceMeters(a: Point, b: Point): number {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRad(b.lat - a.lat);
  const lngDelta = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const distance =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2) * Math.cos(lat1) * Math.cos(lat2);

  return radius * 2 * Math.atan2(Math.sqrt(distance), Math.sqrt(1 - distance));
}

export function getCandidateSearchParams(participants: ParticipantInput[]) {
  const lat = participants.reduce((sum, p) => sum + p.origin.lat, 0) / participants.length;
  const lng = participants.reduce((sum, p) => sum + p.origin.lng, 0) / participants.length;
  const center = { lat, lng };

  const farthestDistance = participants.reduce((maxDistance, p) => {
    return Math.max(maxDistance, haversineDistanceMeters(center, p.origin));
  }, 0);

  const radius = Math.round(Math.min(8_000, Math.max(1_800, farthestDistance * 1.6)));
  return { center, radius };
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) return `${minutes}분`;
  if (restMinutes === 0) return `${hours}시간`;
  return `${hours}시간 ${restMinutes}분`;
}

export function getRecommendationHint(args: {
  recommendation?: RecommendationItem;
  candidateCount: number;
  candidateFallback: boolean;
}): string {
  const messages: string[] = [];

  if (args.candidateCount > 0) {
    messages.push(`${args.candidateCount}곳 후보 기준 추천`);
  } else {
    messages.push("출발지를 2곳 이상 설정하면 후보를 자동 탐색합니다.");
  }

  if (args.candidateFallback) {
    messages.push("실시간 후보를 찾지 못해 중심점 주변 후보를 사용했습니다.");
  } else if (
    args.recommendation?.details.some(
      (detail) => detail.route.isFallback || detail.route.provider === "mock"
    )
  ) {
    messages.push("일부 경로는 실시간 API 대신 예상치(mock)를 사용했습니다.");
  } else if (args.recommendation) {
    messages.push("Google 기준으로 계산했습니다.");
  }

  return messages.join(" · ");
}

export function buildShareText(recommendation: RecommendationItem, participantCount: number): string {
  const lines = [
    `[모임 추천 장소] ${recommendation.place.name}`,
    `참여자 ${participantCount}명 · 최대 이동 ${formatDuration(recommendation.maxDurationSec)}`,
    "",
    ...recommendation.details.map(
      (d) => `${d.participantName}: ${formatDuration(d.route.durationSec)}`
    ),
  ];
  return lines.join("\n");
}
