"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ParticipantInput,
  PlaceCandidate,
  Point,
  RecommendationItem,
  RecommendResponse,
  TravelMode
} from "@/lib/types";

type ParticipantDraft = {
  id: string;
  name: string;
  originLabel?: string;
  point?: Point;
  mode: TravelMode;
};

type PlaceSuggestion = {
  id: string;
  name: string;
  address?: string;
  point: Point;
};

type NearbyPlacesResponse = {
  places?: PlaceCandidate[];
  fallback?: boolean;
  message?: string;
};

type Screen = "map" | "origin" | "newParticipant";

type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
  addListener: (eventName: string, handler: () => void) => void;
};

type GoogleMap = {
  panTo: (point: Point) => void;
};

type GoogleMapsNamespace = {
  Map: new (
    element: HTMLElement,
    options: {
      center: Point;
      zoom: number;
      disableDefaultUI: boolean;
      zoomControl: boolean;
    }
  ) => GoogleMap;
  Marker: new (options: {
    map: GoogleMap;
    position: Point;
    title: string;
    label?: string;
    opacity?: number;
  }) => GoogleMarker;
};

type GoogleWindow = Window & {
  google?: {
    maps?: GoogleMapsNamespace;
  };
  __googleMapsScriptPromise?: Promise<void>;
};

const DEFAULT_MAP_CENTER: Point = { lat: 37.5665, lng: 126.978 };
const DEFAULT_TRAVEL_MODE: TravelMode = "transit";

const initialParticipants: ParticipantDraft[] = [
  {
    id: "p1",
    name: "김진하",
    originLabel: "독립문역",
    point: { lat: 37.5741, lng: 126.9578 },
    mode: DEFAULT_TRAVEL_MODE
  },
  {
    id: "p2",
    name: "지선언니",
    originLabel: "광명",
    point: { lat: 37.4783, lng: 126.8645 },
    mode: DEFAULT_TRAVEL_MODE
  }
];

function makeId() {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  const loadedWindow = window as GoogleWindow;

  if (loadedWindow.google?.maps) return Promise.resolve();
  if (loadedWindow.__googleMapsScriptPromise) return loadedWindow.__googleMapsScriptPromise;

  loadedWindow.__googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=ko&region=KR`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps SDK를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });

  return loadedWindow.__googleMapsScriptPromise;
}

function haversineDistanceMeters(a: Point, b: Point): number {
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

function getCandidateSearchParams(participants: ParticipantInput[]) {
  const lat = participants.reduce((sum, participant) => sum + participant.origin.lat, 0) / participants.length;
  const lng = participants.reduce((sum, participant) => sum + participant.origin.lng, 0) / participants.length;
  const center = { lat, lng };

  const farthestDistance = participants.reduce((maxDistance, participant) => {
    return Math.max(maxDistance, haversineDistanceMeters(center, participant.origin));
  }, 0);

  const radius = Math.round(Math.min(8_000, Math.max(1_800, farthestDistance * 1.6)));
  return { center, radius };
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) {
    return `${minutes}분`;
  }

  if (restMinutes === 0) {
    return `${hours}시간`;
  }

  return `${hours}시간 ${restMinutes}분`;
}

function getRecommendationHint(args: {
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

export default function RecommendDemo() {
  const [screen, setScreen] = useState<Screen>("map");
  const [participants, setParticipants] = useState<ParticipantDraft[]>(initialParticipants);
  const [activeId, setActiveId] = useState<string>(initialParticipants[0].id);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? "";
  const [mapError, setMapError] = useState<string | null>(null);

  const [originInput, setOriginInput] = useState("");
  const [originError, setOriginError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [selectedPoint, setSelectedPoint] = useState<Point | undefined>(undefined);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [candidatePlaces, setCandidatePlaces] = useState<PlaceCandidate[]>([]);
  const [candidateFallback, setCandidateFallback] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMap | null>(null);
  const meetingMarkerRef = useRef<GoogleMarker | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);

  const activeParticipant = useMemo(
    () => participants.find((participant) => participant.id === activeId) ?? participants[0],
    [participants, activeId]
  );

  const recommendationParticipants = useMemo<ParticipantInput[]>(
    () =>
      participants.flatMap((participant) =>
        participant.point
          ? [
              {
                id: participant.id,
                name: participant.name,
                origin: participant.point,
                mode: participant.mode
              }
            ]
          : []
      ),
    [participants]
  );

  const featuredRecommendation = useMemo(
    () =>
      recommendations.find((recommendation) => recommendation.place.id === selectedRecommendationId) ??
      recommendations[0],
    [recommendations, selectedRecommendationId]
  );

  const canSaveOrigin = Boolean(originInput.trim() && selectedPoint);

  useEffect(() => {
    if (recommendations.length === 0) {
      if (selectedRecommendationId !== null) {
        setSelectedRecommendationId(null);
      }
      return;
    }

    const hasSelectedRecommendation = recommendations.some(
      (recommendation) => recommendation.place.id === selectedRecommendationId
    );

    if (!hasSelectedRecommendation) {
      setSelectedRecommendationId(recommendations[0].place.id);
    }
  }, [recommendations, selectedRecommendationId]);

  useEffect(() => {
    if (screen !== "map") return;
    if (!mapsApiKey) {
      setMapError("NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY가 없습니다.");
      return;
    }

    let cancelled = false;

    const initMap = async () => {
      try {
        setMapError(null);
        await loadGoogleMaps(mapsApiKey);
        if (cancelled || !mapRef.current) return;

        const googleMaps = (window as GoogleWindow).google?.maps;
        if (!googleMaps) throw new Error("Google Maps 객체가 없습니다.");

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new googleMaps.Map(mapRef.current, {
            center: featuredRecommendation?.place.point ?? DEFAULT_MAP_CENTER,
            zoom: 11,
            disableDefaultUI: true,
            zoomControl: true
          });
        }

        if (meetingMarkerRef.current) {
          meetingMarkerRef.current.setMap(null);
          meetingMarkerRef.current = null;
        }

        if (featuredRecommendation && mapInstanceRef.current) {
          meetingMarkerRef.current = new googleMaps.Marker({
            map: mapInstanceRef.current,
            position: featuredRecommendation.place.point,
            title: featuredRecommendation.place.name,
            label: "추천"
          });
        }

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        participants.forEach((participant) => {
          if (!participant.point || !mapInstanceRef.current) return;

          const isActive = participant.id === activeId;
          const marker = new googleMaps.Marker({
            map: mapInstanceRef.current,
            position: participant.point,
            title: `${participant.name} (${participant.originLabel ?? "출발지"})`,
            label: isActive ? "선택" : undefined,
            opacity: isActive ? 1 : 0.86
          });

          marker.addListener("click", () => setActiveId(participant.id));
          markersRef.current.push(marker);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "지도 렌더링에 실패했습니다.";
        setMapError(message);
      }
    };

    initMap();

    return () => {
      cancelled = true;
    };
  }, [activeId, featuredRecommendation, mapsApiKey, participants, screen]);

  useEffect(() => {
    if (screen !== "map") return;
    if (!mapInstanceRef.current) return;

    const targetPoint = featuredRecommendation?.place.point ?? activeParticipant?.point;
    if (!targetPoint) return;

    mapInstanceRef.current.panTo(targetPoint);
  }, [activeParticipant, featuredRecommendation, screen]);

  useEffect(() => {
    if (screen !== "origin") return;

    if (selectedPoint) {
      setSuggestions([]);
      setSearchLoading(false);
      return;
    }

    const query = originInput.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);

      try {
        const response = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const json = (await response.json()) as {
          message?: string;
          places?: PlaceSuggestion[];
        };

        if (!response.ok) {
          throw new Error(json.message ?? "장소 검색에 실패했습니다.");
        }

        setSuggestions(json.places ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;

        const message = error instanceof Error ? error.message : "장소 검색에 실패했습니다.";
        setSuggestions([]);
        setOriginError(message);
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [originInput, screen, selectedPoint]);

  useEffect(() => {
    if (recommendationParticipants.length < 2) {
      setCandidatePlaces([]);
      setCandidateFallback(false);
      setCandidateError(null);
      setCandidateLoading(false);
      setRecommendations([]);
      setRecommendError(null);
      setRecommendLoading(false);
      return;
    }

    const controller = new AbortController();
    const { center, radius } = getCandidateSearchParams(recommendationParticipants);

    const fetchCandidatesAndRecommendations = async () => {
      setCandidateLoading(true);
      setCandidateError(null);
      setRecommendError(null);

      let nextCandidates: PlaceCandidate[] = [];

      try {
        const candidateResponse = await fetch(
          `/api/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=${radius}`,
          { signal: controller.signal }
        );
        const candidateJson = (await candidateResponse.json()) as NearbyPlacesResponse;

        if (!candidateResponse.ok) {
          throw new Error(candidateJson.message ?? "추천 후보를 찾지 못했습니다.");
        }

        nextCandidates = candidateJson.places ?? [];
        if (nextCandidates.length === 0) {
          throw new Error("추천 후보를 찾지 못했습니다.");
        }

        if (controller.signal.aborted) return;

        setCandidatePlaces(nextCandidates);
        setCandidateFallback(Boolean(candidateJson.fallback));
      } catch (error) {
        if (controller.signal.aborted) return;

        const message = error instanceof Error ? error.message : "추천 후보를 찾지 못했습니다.";
        setCandidatePlaces([]);
        setCandidateFallback(false);
        setRecommendations([]);
        setCandidateError(message);
        return;
      } finally {
        if (!controller.signal.aborted) {
          setCandidateLoading(false);
        }
      }

      try {
        setRecommendLoading(true);

        const response = await fetch("/api/recommend", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            participants: recommendationParticipants,
            candidates: nextCandidates,
            topK: 3
          }),
          signal: controller.signal
        });

        const json = (await response.json()) as RecommendResponse & { message?: string };
        if (!response.ok) {
          throw new Error(json.message ?? "추천 계산에 실패했습니다.");
        }

        if (controller.signal.aborted) return;

        setRecommendations(json.recommendations ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;

        const message = error instanceof Error ? error.message : "추천 계산에 실패했습니다.";
        setRecommendations([]);
        setRecommendError(message);
      } finally {
        if (!controller.signal.aborted) {
          setRecommendLoading(false);
        }
      }
    };

    fetchCandidatesAndRecommendations();

    return () => {
      controller.abort();
    };
  }, [recommendationParticipants]);

  const openOriginScreen = (participantId: string) => {
    const target = participants.find((participant) => participant.id === participantId);
    if (!target) return;

    setActiveId(target.id);
    setOriginInput(target.originLabel ?? "");
    setSelectedPoint(target.point);
    setSuggestions([]);
    setOriginError(null);
    setScreen("origin");
  };

  const useCurrentLocation = () => {
    setOriginError(null);

    if (!navigator.geolocation) {
      setOriginError("이 브라우저는 현재 위치를 지원하지 않습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        setSelectedPoint(point);

        try {
          const response = await fetch(`/api/places/reverse?lat=${point.lat}&lng=${point.lng}`);
          const json = (await response.json()) as { message?: string; name?: string };

          if (!response.ok) {
            throw new Error(json.message ?? "현재 위치 이름을 가져오지 못했습니다.");
          }

          setOriginInput(json.name || "현재 위치");
        } catch {
          setOriginInput("현재 위치");
        }
      },
      () => {
        setOriginError("현재 위치를 가져오지 못했습니다. 권한 설정을 확인해 주세요.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  };

  const saveOrigin = () => {
    const trimmed = originInput.trim();
    if (!trimmed || !activeParticipant) return;

    if (!selectedPoint) {
      setOriginError("목록에서 장소를 선택하거나 현 위치를 불러와 주세요.");
      return;
    }

    setParticipants((prev) =>
      prev.map((participant) =>
        participant.id === activeParticipant.id
          ? {
              ...participant,
              originLabel: trimmed,
              point: selectedPoint
            }
          : participant
      )
    );

    setOriginInput("");
    setOriginError(null);
    setSelectedPoint(undefined);
    setSuggestions([]);
    setScreen("map");
  };

  const createParticipant = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const next: ParticipantDraft = {
      id: makeId(),
      name: trimmed,
      mode: DEFAULT_TRAVEL_MODE
    };

    setParticipants((prev) => [...prev, next]);
    setActiveId(next.id);
    setNewName("");
    setOriginInput("");
    setOriginError(null);
    setSelectedPoint(undefined);
    setSuggestions([]);
    setScreen("origin");
  };

  if (screen === "origin") {
    return (
      <section className="phone">
        <div className="topBar">
          <button className="iconBtn" onClick={() => setScreen("map")} aria-label="뒤로가기">
            &lt;
          </button>
        </div>

        <div className="viewBody">
          <h2 className="viewTitle">
            <span className="accent">{activeParticipant?.name ?? "참여자"}</span>님의
            <br />
            출발지를 알려주세요
          </h2>

          <div className="lineInputWrap">
            <input
              className="lineInput"
              value={originInput}
              onChange={(event) => {
                setOriginInput(event.target.value);
                setSelectedPoint(undefined);
                setOriginError(null);
              }}
              placeholder="출발지를 입력해주세요"
            />
            <span className="suffixIcon">⌕</span>
          </div>

          <button className="ghostAction" onClick={useCurrentLocation}>
            ◎ 현 위치 불러오기
          </button>

          {originError ? <p className="errorText">{originError}</p> : null}
          {!originError && originInput.trim() && !selectedPoint ? (
            <p className="helperText">목록에서 장소를 선택하거나 현 위치를 불러와 주세요.</p>
          ) : null}

          <div className="suggestionList">
            {searchLoading ? <p className="suggestionStatus">검색 중...</p> : null}
            {!searchLoading && suggestions.length === 0 && originInput.trim().length >= 2 ? (
              <p className="suggestionStatus">검색 결과가 없습니다.</p>
            ) : null}
            {suggestions.map((item) => (
              <button
                key={item.id}
                className="suggestionItem"
                onClick={() => {
                  setOriginInput(item.name);
                  setSelectedPoint(item.point);
                  setSuggestions([]);
                  setOriginError(null);
                }}
              >
                <strong>{item.name}</strong>
                <span>{item.address ?? ""}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bottomCta">
          <button className="mainCta" disabled={!canSaveOrigin} onClick={saveOrigin}>
            참여하기
          </button>
        </div>
      </section>
    );
  }

  if (screen === "newParticipant") {
    return (
      <section className="phone">
        <div className="topBar">
          <button className="iconBtn" onClick={() => setScreen("map")} aria-label="뒤로가기">
            &lt;
          </button>
        </div>

        <div className="viewBody">
          <h2 className="viewTitle">
            새로운 출발지 추가를 위해
            <br />
            이름을 알려주세요
          </h2>

          <div className="lineInputWrap">
            <input
              className="lineInput"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="이름"
            />
            {newName ? (
              <button className="clearBtn" onClick={() => setNewName("")} aria-label="입력 지우기">
                ×
              </button>
            ) : null}
          </div>
        </div>

        <div className="bottomCta">
          <button className="mainCta active" disabled={!newName.trim()} onClick={createParticipant}>
            다음
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="phone mapScreen">
      <header className="mapHeader">
        <div className="brand">모임</div>
        <div className="avatar" />
      </header>

      <div className="mapPrompt">
        <span className="mapPromptSub">어디서 만나실 건가요?</span>
        <strong>
          {candidateLoading
            ? "참가자 기준으로 후보 장소를 찾는 중..."
            : candidatePlaces.length > 0
              ? `${candidatePlaces.length}곳 후보에서 추천합니다`
              : "참가자 기준으로 자동 추천합니다"}
        </strong>
      </div>

      <div className="mapArea" ref={mapRef}>
        {!mapsApiKey ? <p className="mapState">지도 키를 설정해 주세요.</p> : null}
        {mapError ? <p className="mapState">{mapError}</p> : null}
      </div>

      <div className="sheet">
        <p className="sheetEyebrow">추천 장소</p>
        <h3>
          {candidateLoading || recommendLoading
            ? "추천 계산 중..."
            : featuredRecommendation?.place.name ?? "출발지를 더 설정해 주세요"}
        </h3>
        <p className="dateText">
          {candidateError ??
            recommendError ??
            getRecommendationHint({
              recommendation: featuredRecommendation,
              candidateCount: candidatePlaces.length,
              candidateFallback
            })}
        </p>

        <div className="activeBadgeWrap">
          <span className="activeBadge">
            {featuredRecommendation
              ? `최대 이동 ${formatDuration(featuredRecommendation.maxDurationSec)} · 총 이동 ${formatDuration(featuredRecommendation.totalDurationSec)}`
              : `확정된 출발지 ${recommendationParticipants.length}명`}
          </span>
        </div>

        <div className="originChips">
          {participants.map((participant) => (
            <button
              key={participant.id}
              className={`chip${participant.id === activeId ? " active" : ""}`}
              onClick={() => openOriginScreen(participant.id)}
            >
              {participant.originLabel ?? `${participant.name} 출발지`}
            </button>
          ))}
        </div>

        <div className="detailList">
          {featuredRecommendation ? (
            featuredRecommendation.details.map((detail) => (
              <div key={detail.participantId} className="detailRow">
                <span className="detailLabel">{detail.participantName}</span>
                <span className="detailValue">{formatDuration(detail.route.durationSec)}</span>
              </div>
            ))
          ) : (
            <p className="detailEmpty">출발지를 2곳 이상 확정하면 추천 결과를 보여줍니다.</p>
          )}
        </div>

        {recommendations.length > 1 ? (
          <div className="recommendationList">
            {recommendations.map((item, index) => (
              <button
                key={item.place.id}
                type="button"
                className={`recommendationItem${
                  item.place.id === featuredRecommendation?.place.id ? " active" : ""
                }`}
                onClick={() => setSelectedRecommendationId(item.place.id)}
              >
                <span className="recommendationRank">{index + 1}</span>
                <div className="recommendationInfo">
                  <strong>{item.place.name}</strong>
                  <span>
                    최대 {formatDuration(item.maxDurationSec)} · 총 {formatDuration(item.totalDurationSec)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        <div className="sheetActions">
          <button className="addBtn" onClick={() => setScreen("newParticipant")}>
            출발지 추가하기
          </button>
          <button className="shareBtn" aria-label="공유" disabled>
            ⤴
          </button>
        </div>
      </div>
    </section>
  );
}
