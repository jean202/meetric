"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ParticipantInput,
  PlaceCandidate,
  Point,
  RecommendationItem,
  RecommendResponse,
} from "@/lib/types";
import type { ParticipantDraft, Screen } from "./recommend/types";
import { DEFAULT_MAP_CENTER, DEFAULT_TRAVEL_MODE } from "./recommend/types";
import { getCandidateSearchParams, makeId } from "./recommend/utils";
import { loadParticipants, saveParticipants } from "@/lib/storage";
import OriginScreen from "./recommend/OriginScreen";
import NewParticipantScreen from "./recommend/NewParticipantScreen";
import RecommendPanel from "./recommend/RecommendPanel";

type NearbyPlacesResponse = {
  places?: PlaceCandidate[];
  fallback?: boolean;
  message?: string;
};

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
    options: { center: Point; zoom: number; disableDefaultUI: boolean; zoomControl: boolean }
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
  google?: { maps?: GoogleMapsNamespace };
  __googleMapsScriptPromise?: Promise<void>;
};

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  const w = window as GoogleWindow;
  if (w.google?.maps) return Promise.resolve();
  if (w.__googleMapsScriptPromise) return w.__googleMapsScriptPromise;

  w.__googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=ko&region=KR`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps SDK를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });

  return w.__googleMapsScriptPromise;
}

const initialParticipants: ParticipantDraft[] = [
  { id: "p1", name: "김진하", originLabel: "독립문역", point: { lat: 37.5741, lng: 126.9578 }, mode: DEFAULT_TRAVEL_MODE },
  { id: "p2", name: "지선언니", originLabel: "광명", point: { lat: 37.4783, lng: 126.8645 }, mode: DEFAULT_TRAVEL_MODE },
];

export default function RecommendDemo() {
  const [screen, setScreen] = useState<Screen>("map");
  const [participants, setParticipants] = useState<ParticipantDraft[]>(() => {
    const saved = loadParticipants();
    return saved && saved.length > 0 ? saved : initialParticipants;
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadParticipants();
    return saved && saved.length > 0 ? saved[0].id : initialParticipants[0].id;
  });

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? "";
  const [mapError, setMapError] = useState<string | null>(null);

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
    () => participants.find((p) => p.id === activeId) ?? participants[0],
    [participants, activeId]
  );

  const recommendationParticipants = useMemo<ParticipantInput[]>(
    () =>
      participants.flatMap((p) =>
        p.point ? [{ id: p.id, name: p.name, origin: p.point, mode: p.mode }] : []
      ),
    [participants]
  );

  const featuredRecommendation = useMemo(
    () =>
      recommendations.find((r) => r.place.id === selectedRecommendationId) ?? recommendations[0],
    [recommendations, selectedRecommendationId]
  );

  // Persist participants to localStorage
  useEffect(() => {
    saveParticipants(participants);
  }, [participants]);

  // Sync selectedRecommendationId with recommendations
  useEffect(() => {
    if (recommendations.length === 0) {
      if (selectedRecommendationId !== null) setSelectedRecommendationId(null);
      return;
    }
    const exists = recommendations.some((r) => r.place.id === selectedRecommendationId);
    if (!exists) setSelectedRecommendationId(recommendations[0].place.id);
  }, [recommendations, selectedRecommendationId]);

  // Google Maps initialization & marker sync
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
            zoomControl: true,
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
            label: "추천",
          });
        }

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

        participants.forEach((p) => {
          if (!p.point || !mapInstanceRef.current) return;
          const isActive = p.id === activeId;
          const marker = new googleMaps.Marker({
            map: mapInstanceRef.current,
            position: p.point,
            title: `${p.name} (${p.originLabel ?? "출발지"})`,
            label: isActive ? "선택" : undefined,
            opacity: isActive ? 1 : 0.86,
          });
          marker.addListener("click", () => setActiveId(p.id));
          markersRef.current.push(marker);
        });
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "지도 렌더링에 실패했습니다.");
      }
    };

    initMap();
    return () => { cancelled = true; };
  }, [activeId, featuredRecommendation, mapsApiKey, participants, screen]);

  // Pan map to active target
  useEffect(() => {
    if (screen !== "map" || !mapInstanceRef.current) return;
    const targetPoint = featuredRecommendation?.place.point ?? activeParticipant?.point;
    if (targetPoint) mapInstanceRef.current.panTo(targetPoint);
  }, [activeParticipant, featuredRecommendation, screen]);

  // Fetch candidates & recommendations
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

    const run = async () => {
      setCandidateLoading(true);
      setCandidateError(null);
      setRecommendError(null);

      let nextCandidates: PlaceCandidate[] = [];

      try {
        const res = await fetch(
          `/api/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=${radius}`,
          { signal: controller.signal }
        );
        const json = (await res.json()) as NearbyPlacesResponse;
        if (!res.ok) throw new Error(json.message ?? "추천 후보를 찾지 못했습니다.");

        nextCandidates = json.places ?? [];
        if (nextCandidates.length === 0) throw new Error("추천 후보를 찾지 못했습니다.");
        if (controller.signal.aborted) return;

        setCandidatePlaces(nextCandidates);
        setCandidateFallback(Boolean(json.fallback));
      } catch (error) {
        if (controller.signal.aborted) return;
        setCandidatePlaces([]);
        setCandidateFallback(false);
        setRecommendations([]);
        setCandidateError(error instanceof Error ? error.message : "추천 후보를 찾지 못했습니다.");
        return;
      } finally {
        if (!controller.signal.aborted) setCandidateLoading(false);
      }

      try {
        setRecommendLoading(true);
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants: recommendationParticipants, candidates: nextCandidates, topK: 3 }),
          signal: controller.signal,
        });
        const json = (await res.json()) as RecommendResponse & { message?: string };
        if (!res.ok) throw new Error(json.message ?? "추천 계산에 실패했습니다.");
        if (controller.signal.aborted) return;
        setRecommendations(json.recommendations ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRecommendations([]);
        setRecommendError(error instanceof Error ? error.message : "추천 계산에 실패했습니다.");
      } finally {
        if (!controller.signal.aborted) setRecommendLoading(false);
      }
    };

    run();
    return () => { controller.abort(); };
  }, [recommendationParticipants]);

  // ─── Screen routing ───────────────────────────────────

  if (screen === "origin" && activeParticipant) {
    return (
      <OriginScreen
        participant={activeParticipant}
        onBack={() => setScreen("map")}
        onSave={(label, point) => {
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === activeParticipant.id ? { ...p, originLabel: label, point } : p
            )
          );
          setScreen("map");
        }}
      />
    );
  }

  if (screen === "newParticipant") {
    return (
      <NewParticipantScreen
        onBack={() => setScreen("map")}
        onCreate={(name) => {
          const next: ParticipantDraft = { id: makeId(), name, mode: DEFAULT_TRAVEL_MODE };
          setParticipants((prev) => [...prev, next]);
          setActiveId(next.id);
          setScreen("origin");
        }}
      />
    );
  }

  // ─── Map screen ───────────────────────────────────────

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

      <RecommendPanel
        participants={participants}
        activeId={activeId}
        candidatePlaces={candidatePlaces}
        candidateFallback={candidateFallback}
        candidateLoading={candidateLoading}
        candidateError={candidateError}
        recommendations={recommendations}
        recommendLoading={recommendLoading}
        recommendError={recommendError}
        featuredRecommendation={featuredRecommendation}
        confirmedCount={recommendationParticipants.length}
        onSelectRecommendation={setSelectedRecommendationId}
        onChipClick={(id) => {
          setActiveId(id);
          setScreen("origin");
        }}
        onAddParticipant={() => setScreen("newParticipant")}
      />
    </section>
  );
}
