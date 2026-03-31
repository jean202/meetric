import {
  ParticipantInput,
  PlaceCandidate,
  Point,
  RecommendRequest,
  TravelMode
} from "@/lib/types";

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseString(value: unknown, fieldName: string): ValidationResult<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, message: `${fieldName}은(는) 비어 있지 않은 문자열이어야 합니다.` };
  }

  return { ok: true, data: value.trim() };
}

function parsePoint(value: unknown, fieldName: string): ValidationResult<Point> {
  if (!isRecord(value)) {
    return { ok: false, message: `${fieldName}은(는) lat/lng 객체여야 합니다.` };
  }

  const lat = value.lat;
  const lng = value.lng;

  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, message: `${fieldName}.lat 값이 올바르지 않습니다.` };
  }

  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, message: `${fieldName}.lng 값이 올바르지 않습니다.` };
  }

  return { ok: true, data: { lat, lng } };
}

function parseTravelMode(value: unknown, fieldName: string): ValidationResult<TravelMode> {
  if (value === "car" || value === "transit" || value === "bike" || value === "walk") {
    return { ok: true, data: value };
  }

  return { ok: false, message: `${fieldName}은(는) car/transit/bike/walk 중 하나여야 합니다.` };
}

function parseParticipant(value: unknown, index: number): ValidationResult<ParticipantInput> {
  if (!isRecord(value)) {
    return { ok: false, message: `participants[${index}] 형식이 올바르지 않습니다.` };
  }

  const id = parseString(value.id, `participants[${index}].id`);
  if (!id.ok) return id;

  const name = parseString(value.name, `participants[${index}].name`);
  if (!name.ok) return name;

  const origin = parsePoint(value.origin, `participants[${index}].origin`);
  if (!origin.ok) return origin;

  const mode = parseTravelMode(value.mode, `participants[${index}].mode`);
  if (!mode.ok) return mode;

  return {
    ok: true,
    data: {
      id: id.data,
      name: name.data,
      origin: origin.data,
      mode: mode.data
    }
  };
}

function parseCandidate(value: unknown, index: number): ValidationResult<PlaceCandidate> {
  if (!isRecord(value)) {
    return { ok: false, message: `candidates[${index}] 형식이 올바르지 않습니다.` };
  }

  const id = parseString(value.id, `candidates[${index}].id`);
  if (!id.ok) return id;

  const name = parseString(value.name, `candidates[${index}].name`);
  if (!name.ok) return name;

  const point = parsePoint(value.point, `candidates[${index}].point`);
  if (!point.ok) return point;

  let category: string | undefined;
  if (value.category !== undefined) {
    const parsedCategory = parseString(value.category, `candidates[${index}].category`);
    if (!parsedCategory.ok) return parsedCategory;
    category = parsedCategory.data;
  }

  return {
    ok: true,
    data: {
      id: id.data,
      name: name.data,
      point: point.data,
      category
    }
  };
}

export function validateRecommendRequest(value: unknown): ValidationResult<RecommendRequest> {
  if (!isRecord(value)) {
    return { ok: false, message: "요청 본문은 JSON 객체여야 합니다." };
  }

  if (!Array.isArray(value.participants)) {
    return { ok: false, message: "participants 배열이 필요합니다." };
  }

  if (!Array.isArray(value.candidates)) {
    return { ok: false, message: "candidates 배열이 필요합니다." };
  }

  if (value.participants.length < 2) {
    return { ok: false, message: "participants는 최소 2명 이상이어야 합니다." };
  }

  if (value.participants.length > 20) {
    return { ok: false, message: "participants는 최대 20명까지 지원합니다." };
  }

  if (value.candidates.length === 0) {
    return { ok: false, message: "candidates는 최소 1개 이상이어야 합니다." };
  }

  if (value.candidates.length > 25) {
    return { ok: false, message: "candidates는 최대 25개까지 지원합니다." };
  }

  const participants: ParticipantInput[] = [];
  for (let index = 0; index < value.participants.length; index += 1) {
    const parsed = parseParticipant(value.participants[index], index);
    if (!parsed.ok) return parsed;
    participants.push(parsed.data);
  }

  const candidates: PlaceCandidate[] = [];
  for (let index = 0; index < value.candidates.length; index += 1) {
    const parsed = parseCandidate(value.candidates[index], index);
    if (!parsed.ok) return parsed;
    candidates.push(parsed.data);
  }

  let topK: number | undefined;
  if (value.topK !== undefined) {
    if (
      typeof value.topK !== "number" ||
      !Number.isInteger(value.topK) ||
      value.topK < 1 ||
      value.topK > 10
    ) {
      return { ok: false, message: "topK는 1 이상 10 이하의 정수여야 합니다." };
    }

    topK = value.topK;
  }

  return {
    ok: true,
    data: {
      participants,
      candidates,
      topK
    }
  };
}
