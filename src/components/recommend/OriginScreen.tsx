"use client";

import { useEffect, useState } from "react";
import type { Point } from "@/lib/types";
import type { ParticipantDraft, PlaceSuggestion } from "./types";

type Props = {
  participant: ParticipantDraft;
  onBack: () => void;
  onSave: (originLabel: string, point: Point) => void;
};

export default function OriginScreen({ participant, onBack, onSave }: Props) {
  const [originInput, setOriginInput] = useState(participant.originLabel ?? "");
  const [selectedPoint, setSelectedPoint] = useState<Point | undefined>(participant.point);
  const [originError, setOriginError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const canSave = Boolean(originInput.trim() && selectedPoint);

  useEffect(() => {
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
          signal: controller.signal,
        });
        const json = (await response.json()) as { message?: string; places?: PlaceSuggestion[] };

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
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [originInput, selectedPoint]);

  const useCurrentLocation = () => {
    setOriginError(null);

    if (!navigator.geolocation) {
      setOriginError("이 브라우저는 현재 위치를 지원하지 않습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setSelectedPoint(point);

        try {
          const response = await fetch(`/api/places/reverse?lat=${point.lat}&lng=${point.lng}`);
          const json = (await response.json()) as { message?: string; name?: string };
          if (!response.ok) throw new Error(json.message ?? "현재 위치 이름을 가져오지 못했습니다.");
          setOriginInput(json.name || "현재 위치");
        } catch {
          setOriginInput("현재 위치");
        }
      },
      () => {
        setOriginError("현재 위치를 가져오지 못했습니다. 권한 설정을 확인해 주세요.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = () => {
    const trimmed = originInput.trim();
    if (!trimmed || !selectedPoint) {
      setOriginError("목록에서 장소를 선택하거나 현 위치를 불러와 주세요.");
      return;
    }
    onSave(trimmed, selectedPoint);
  };

  return (
    <section className="phone">
      <div className="topBar">
        <button className="iconBtn" onClick={onBack} aria-label="뒤로가기">
          &lt;
        </button>
      </div>

      <div className="viewBody">
        <h2 className="viewTitle">
          <span className="accent">{participant.name}</span>님의
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
        <button className="mainCta" disabled={!canSave} onClick={handleSave}>
          참여하기
        </button>
      </div>
    </section>
  );
}
