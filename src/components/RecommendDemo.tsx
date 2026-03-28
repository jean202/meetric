"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TravelMode = "car" | "transit" | "bike" | "walk";

type Point = {
  lat: number;
  lng: number;
};

type Participant = {
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

type RouteQuote = {
  mode: TravelMode;
  durationSec: number;
  distanceM: number;
  fareKRW?: number;
  provider: string;
};

type ParticipantRoute = {
  participantId: string;
  participantName: string;
  route: RouteQuote;
};

type RecommendationItem = {
  place: { id: string; name: string; point: Point; category?: string };
  score: number;
  maxDurationSec: number;
  totalDurationSec: number;
  details: ParticipantRoute[];
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

const DEFAULT_CENTER: Point = { lat: 37.5740182, lng: 126.9575384 };

const initialParticipants: Participant[] = [
  { id: "p1", name: "김진하", originLabel: "독립문역", point: { lat: 37.5741, lng: 126.9578 }, mode: "transit" },
  { id: "p2", name: "지선언니", originLabel: "광명", point: { lat: 37.4783, lng: 126.8645 }, mode: "transit" }
];

const MODE_LABELS: Record<TravelMode, string> = {
  transit: "🚌 대중교통",
  car: "🚗 자동차",
  bike: "🚲 자전거",
  walk: "🚶 도보",
};

function makeId() {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}

function centroid(points: Point[]): Point {
  const n = points.length;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lng: points.reduce((s, p) => s + p.lng, 0) / n,
  };
}

function formatDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
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

export default function RecommendDemo() {
  const [screen, setScreen] = useState<Screen>("map");
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [activeId, setActiveId] = useState<string>(initialParticipants[0].id);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? "";
  const [mapError, setMapError] = useState<string | null>(null);

  const [originInput, setOriginInput] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedPoint, setSelectedPoint] = useState<Point | undefined>(undefined);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Recommendation state
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [selectedRec, setSelectedRec] = useState<RecommendationItem | null>(null);
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);

  const activeParticipant = useMemo(
    () => participants.find((p) => p.id === activeId) ?? participants[0],
    [participants, activeId]
  );

  // Meeting point: selected recommendation or default
  const meetingPoint = selectedRec?.place.point ?? DEFAULT_CENTER;
  const meetingLabel = selectedRec?.place.name ?? "모임 장소";

  // Can recommend: at least 2 participants with valid origins
  const readyParticipants = participants.filter((p) => p.point);
  const canRecommend = readyParticipants.length >= 2;

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
            center: meetingPoint,
            zoom: 11,
            disableDefaultUI: true,
            zoomControl: true
          });
        }

        // Clear existing markers
        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        // Meeting point marker
        const mpMarker = new googleMaps.Marker({
          map: mapInstanceRef.current,
          position: meetingPoint,
          title: meetingLabel,
          label: selectedRec ? "★" : undefined,
        });
        markersRef.current.push(mpMarker);

        // Participant markers
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
  }, [activeId, mapsApiKey, participants, screen, meetingPoint, meetingLabel, selectedRec]);

  useEffect(() => {
    if (screen !== "map") return;
    if (!mapInstanceRef.current) return;

    if (selectedRec) {
      mapInstanceRef.current.panTo(selectedRec.place.point);
    } else if (activeParticipant?.point) {
      mapInstanceRef.current.panTo(activeParticipant.point);
    }
  }, [activeParticipant, screen, selectedRec]);

  useEffect(() => {
    if (screen !== "origin") return;
    const query = originInput.trim();

    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error("장소 검색 실패");
        const json = (await res.json()) as { places: PlaceSuggestion[] };
        setSuggestions(json.places ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [originInput, screen]);

  const openOriginScreen = (participantId: string) => {
    const target = participants.find((p) => p.id === participantId);
    if (!target) return;

    setActiveId(target.id);
    setOriginInput(target.originLabel ?? "");
    setSelectedPoint(target.point);
    setSuggestions([]);
    setScreen("origin");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        setSelectedPoint(point);

        try {
          const res = await fetch(`/api/places/reverse?lat=${point.lat}&lng=${point.lng}`);
          if (!res.ok) throw new Error();
          const json = (await res.json()) as { name: string };
          setOriginInput(json.name || "현재 위치");
        } catch {
          setOriginInput("현재 위치");
        }
      },
      () => {
        // Geolocation failed: don't set fake origin, show feedback
        setOriginInput("");
        alert("위치 권한이 거부되었습니다. 출발지를 직접 검색해주세요.");
      }
    );
  };

  const saveOrigin = () => {
    const trimmed = originInput.trim();
    if (!trimmed || !activeParticipant || !selectedPoint) return;

    setParticipants((prev) =>
      prev.map((p) =>
        p.id === activeParticipant.id
          ? {
              ...p,
              originLabel: trimmed,
              point: selectedPoint,
            }
          : p
      )
    );

    // Clear recommendation when origins change
    setRecommendations([]);
    setSelectedRec(null);

    setOriginInput("");
    setSelectedPoint(undefined);
    setSuggestions([]);
    setScreen("map");
  };

  const createParticipant = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const next: Participant = { id: makeId(), name: trimmed, mode: "transit" };
    setParticipants((prev) => [...prev, next]);
    setActiveId(next.id);
    setNewName("");
    setOriginInput("");
    setSelectedPoint(undefined);
    setSuggestions([]);
    setScreen("origin");
  };

  const handleRecommend = async () => {
    if (!canRecommend) return;

    setIsRecommending(true);
    setRecommendError(null);
    setIsDegraded(false);

    try {
      // 1. Calculate centroid of participants
      const participantPoints = readyParticipants.map((p) => p.point!);
      const center = centroid(participantPoints);

      // 2. Fetch nearby candidate places
      const nearbyRes = await fetch(
        `/api/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=3000`
      );
      if (!nearbyRes.ok) throw new Error("후보 장소 검색 실패");
      const nearbyJson = await nearbyRes.json();
      const candidates = nearbyJson.places;

      if (!candidates || candidates.length === 0) {
        throw new Error("주변에 후보 장소를 찾지 못했습니다.");
      }

      if (nearbyJson.fallback) {
        setIsDegraded(true);
      }

      // 3. Call recommendation API
      const participantInputs = readyParticipants.map((p) => ({
        id: p.id,
        name: p.name,
        origin: p.point!,
        mode: p.mode,
      }));

      const recRes = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participants: participantInputs,
          candidates,
          topK: 5,
        }),
      });

      if (!recRes.ok) {
        const errJson = await recRes.json().catch(() => null);
        throw new Error(errJson?.message ?? "추천 API 오류");
      }

      const recJson = await recRes.json();
      const recs: RecommendationItem[] = recJson.recommendations ?? [];

      if (recs.length === 0) {
        throw new Error("추천 결과가 없습니다.");
      }

      // Check if any routes used mock provider
      const hasMock = recs.some((r) =>
        r.details.some((d) => d.route.provider === "mock")
      );
      if (hasMock) setIsDegraded(true);

      setRecommendations(recs);
      setSelectedRec(recs[0]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "추천 중 오류가 발생했습니다.";
      setRecommendError(msg);
    } finally {
      setIsRecommending(false);
    }
  };

  const selectRecommendation = (rec: RecommendationItem) => {
    setSelectedRec(rec);
  };

  // === Origin Screen ===
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
              onChange={(e) => {
                setOriginInput(e.target.value);
                setSelectedPoint(undefined);
              }}
              placeholder="출발지를 입력해주세요"
            />
            <span className="suffixIcon">⌕</span>
          </div>

          <button className="ghostAction" onClick={useCurrentLocation}>
            ◎ 현 위치 불러오기
          </button>

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
                }}
              >
                <strong>{item.name}</strong>
                <span>{item.address ?? ""}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bottomCta">
          <button
            className="mainCta"
            disabled={!originInput.trim() || !selectedPoint}
            onClick={saveOrigin}
          >
            참여하기
          </button>
        </div>
      </section>
    );
  }

  // === New Participant Screen ===
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
              onChange={(e) => setNewName(e.target.value)}
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

  // === Map Screen ===
  return (
    <section className="phone mapScreen">
      <header className="mapHeader">
        <div className="brand">모임</div>
        <div className="avatar" />
      </header>

      <div className="mapPrompt">
        <span className="mapPromptSub">어디서 만나실 건가요?</span>
        <strong>
          {selectedRec ? selectedRec.place.name : "장소를 정해보세요"}
        </strong>
      </div>

      <div className="mapArea" ref={mapRef}>
        {!mapsApiKey ? <p className="mapState">지도 키 로딩 중...</p> : null}
        {mapError ? <p className="mapState">{mapError}</p> : null}
      </div>

      <div className="sheet">
        <h3>지선지나</h3>
        <p className="dateText">2026년 2월 28일, 18:00</p>

        <div className="activeBadgeWrap">
          <span className="activeBadge">
            선택됨: {activeParticipant?.name ?? "참여자"} · {activeParticipant?.originLabel ?? "출발지 미설정"}
          </span>
        </div>

        <div className="originChips">
          {participants.map((p) => (
            <button
              key={p.id}
              className={`chip${p.id === activeId ? " active" : ""}`}
              onClick={() => openOriginScreen(p.id)}
            >
              {p.originLabel ?? `${p.name} 출발지`}
            </button>
          ))}
        </div>

        {/* Recommendation results */}
        {recommendations.length > 0 ? (
          <div className="recSection">
            {isDegraded && (
              <p className="degradedBadge">
                예상 데이터 기반 결과입니다 (실제 경로 API 미사용)
              </p>
            )}
            <div className="recList">
              {recommendations.map((rec, i) => (
                <button
                  key={rec.place.id}
                  className={`recItem${selectedRec?.place.id === rec.place.id ? " recItemActive" : ""}`}
                  onClick={() => selectRecommendation(rec)}
                >
                  <span className="recRank">{i + 1}</span>
                  <div className="recInfo">
                    <strong>{rec.place.name}</strong>
                    <span className="recSummary">
                      최대 {formatDuration(rec.maxDurationSec)}
                    </span>
                    <div className="recDetails">
                      {rec.details.map((d) => (
                        <span key={d.participantId} className="recDetail">
                          {d.participantName} {formatDuration(d.route.durationSec)}
                          {d.route.fareKRW ? ` · ${d.route.fareKRW.toLocaleString()}원` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="duration">
            {isRecommending
              ? "추천 중..."
              : recommendError
                ? recommendError
                : canRecommend
                  ? "아래 버튼으로 만남 장소를 추천받으세요"
                  : "출발지를 2명 이상 설정해주세요"}
          </div>
        )}

        <div className="sheetActions">
          <button className="addBtn" onClick={() => setScreen("newParticipant")}>
            👤+ 출발지 추가하기
          </button>
          {canRecommend && (
            <button
              className="recBtn"
              onClick={handleRecommend}
              disabled={isRecommending}
            >
              {isRecommending ? "..." : "추천"}
            </button>
          )}
          <button className="shareBtn" aria-label="공유">
            ⤴
          </button>
        </div>
      </div>
    </section>
  );
}
