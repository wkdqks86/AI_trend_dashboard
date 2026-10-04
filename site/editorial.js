/* 변화 중심 지면의 표시만 담당합니다. 노션 데이터와 집계 방식은 바꾸지 않습니다. */
(function () {
  "use strict";

  // 원문에 HTML 기호가 있어도 코드로 실행되지 않고 글자로 표시되게 합니다.
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (character) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[character];
    });
  }

  /* 승인한 시안의 편집 문구입니다.
   * 날짜나 배열 순서 대신 원문 전체로 비교합니다.
   * 원문이 바뀌면 예전 숫자·해석을 재사용하지 않고 아래 기본 표시로 돌아갑니다. */
  const approvedBriefs = new Map([
    ["OpenAI DevDay(9/30): GPT-6.1 Sol, 에이전트 dot, $500 플랜이 나왔다. 기존 $200 플랜은 10/30부터 사용량이 ×20에서 ×10으로 줄어든다.", {
      label: "출시·요금제 기록",
      title: "새 출시, 달라지는 한도",
      type: "launch",
      takeaway: "출시 소식과 사용 조건을 함께 확인."
    }],
    ["하네스는 '쌓기'에서 '덜어내기'로 굳어졌다. 스킬 대신 요구사항 문서와 검증 구조만 남기고, 살아남은 건 인터뷰 스킬과 디자인 검수 스킬 정도다.", {
      label: "커뮤니티 의견",
      title: "더 쌓기보다, 덜어내기",
      type: "workflow",
      takeaway: "인터뷰·디자인 검수 스킬은 남긴다는 관찰."
    }],
    ["판정 보류: Gemini 4 Argon(발표됐지만 개인 미배포), Opus 5.5 너프 체감(의견이 갈림), dot이 비서형 에이전트를 흡수할지.", {
      label: "판정 보류",
      title: "결론보다, 계속 관찰",
      type: "watch",
      takeaway: "확정된 결론과 분리해서 읽기."
    }]
  ]);

  function renderApprovedDiagram(type) {
    if (type === "launch") {
      return `<div class="brief-items"><div><strong>Sol 6.1</strong><small>모델</small></div><div><strong>dot</strong><small>에이전트</small></div><div><strong>$500</strong><small>새 플랜</small></div></div>
        <div class="brief-timeline"><p>기록상 $200 플랜 · 10/30부터</p><div class="brief-limit"><span>×20</span><span class="editorial-arrow" aria-label="변경">→</span><span>×10</span></div></div>`;
    }
    if (type === "workflow") {
      return `<div class="brief-step">스킬·규칙을 계속 추가</div><span class="editorial-down" aria-label="관점 변화">↓</span><div class="brief-step is-focus">요구사항 문서 + 검증 구조</div>`;
    }
    return `<ul class="brief-watch"><li><strong>Gemini 4 Argon</strong><span>발표 · 개인 미배포</span></li><li><strong>Opus 5.5 너프 체감</strong><span>의견 엇갈림</span></li><li><strong>dot의 역할</strong><span>비서형 에이전트 흡수 여부</span></li></ul>`;
  }

  // 새 주차는 편집 문구가 없어도 원문을 문장별로 나눠 읽을 수 있습니다.
  // 단순한 문자 수 자르기를 하지 않아 부정 표현·조건이 중간에 잘리지 않습니다.
  function renderFallback(text) {
    const sentences = text.split(/(?<=[.!?。])\s+/u).filter(Boolean);
    return `<div class="brief-extract">${sentences.slice(0, 2).map(function (sentence) {
      return `<p>${escapeHtml(sentence)}</p>`;
    }).join("")}</div>`;
  }

  function renderBriefing(records) {
    if (!records.length) return `<p class="empty">이 주에는 브리핑이 없어요.</p>`;
    return records.map(function (raw, index) {
      const text = String(raw ?? "");
      const approved = approvedBriefs.get(text);
      const label = approved ? approved.label : "주간 기록";
      const title = approved ? approved.title : `이번 주 관찰 ${String(index + 1).padStart(2, "0")}`;
      const diagram = approved ? renderApprovedDiagram(approved.type) : renderFallback(text);
      return `<article class="brief-signal">
        <div class="brief-top"><span class="brief-index">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(label)}</span></div>
        <h3>${escapeHtml(title)}</h3><div class="brief-diagram">${diagram}</div>
        ${approved ? `<p class="brief-takeaway">${escapeHtml(approved.takeaway)}</p>` : ""}
        <details class="editorial-detail"><summary>기록 원문 펼치기</summary><p>${escapeHtml(text)}</p></details>
      </article>`;
    }).join("");
  }

  // 연결된 제목이 모두 일치할 때만 승인된 짧은 표현을 사용합니다.
  function compactChange(old, next) {
    if (old.title === "Sol 6은 테라 이름만 바꾼 것 — 재계획 능력 상실" && next.title === "OpenAI DevDay: GPT-6.1 Sol·Ultrafast·dot·Pro $500 신설") {
      return {before: "Sol 6의 재계획 능력에 대한 부정적 평가", after: "GPT-6.1 Sol 등 후속 출시 기록으로 연결"};
    }
    if (old.title === "OpenAI Pro/×20 신규가입 잠정 중단" && next.title === "Pro $200은 10/30부터 ×20 → ×10, 5시간 제한은 재도입 안 함") {
      return {before: "Pro / ×20 신규 가입 잠정 중단", after: "후속 정책: $200 플랜 ×20 → ×10"};
    }
    return {before: old.title, after: next.title};
  }

  function renderChanges(pairs) {
    return pairs.map(function ({old, nw}) {
      const short = compactChange(old, nw);
      const date = old.statusChangedAt || nw.date;
      const formattedDate = date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : "날짜 미기록";
      const category = old.topics?.[0] || "판단 기록";
      const status = old.status === "부분 유효" ? "일부만 유효" : "지나감";
      return `<article class="change-card">
        <div class="change-top"><span>${escapeHtml(category)}</span><time>${formattedDate}</time></div>
        <h4>이전 관찰에서 후속 기록으로</h4>
        <div class="change-label">이전 기록</div><div class="change-before">${escapeHtml(short.before)}</div>
        <span class="editorial-down" aria-label="후속 기록으로 연결">↓</span>
        <div class="change-label">연결된 후속 기록</div><div class="change-after">${escapeHtml(short.after)}</div>
        <details class="editorial-detail"><summary>이전·후속 기록 전체 보기</summary><p>이전: ${escapeHtml(old.title)}</p>${old.summary ? `<p>${escapeHtml(old.summary)}</p>` : ""}<p>후속: ${escapeHtml(nw.title)}</p>${nw.summary ? `<p>${escapeHtml(nw.summary)}</p>` : ""}</details>
        <p class="change-status">이전 기록: ${status} · 현재 상태 기준${old.keywords?.length ? " · " + escapeHtml(old.keywords.join(", ")) : ""}</p>
      </article>`;
    }).join("");
  }

  // 2개의 표시 함수를 공개해 app.js가 주차 이동·필터 기능을 그대로 담당하게 합니다.
  window.AIWeeklyEditorial = {renderBriefing, renderChanges};
})();
