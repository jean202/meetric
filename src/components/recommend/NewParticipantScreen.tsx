"use client";

import { useState } from "react";

type Props = {
  onBack: () => void;
  onCreate: (name: string) => void;
};

export default function NewParticipantScreen({ onBack, onCreate }: Props) {
  const [newName, setNewName] = useState("");

  return (
    <section className="phone">
      <div className="topBar">
        <button className="iconBtn" onClick={onBack} aria-label="뒤로가기">
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
        <button
          className="mainCta active"
          disabled={!newName.trim()}
          onClick={() => onCreate(newName.trim())}
        >
          다음
        </button>
      </div>
    </section>
  );
}
