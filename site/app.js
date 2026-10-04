(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const DAY = 86400000;
  const toDate = (s) => new Date(s + "T00:00:00Z");
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
  const inWeek = (d, w) => d && d >= w && d <= addDays(w, 6);
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : "");
  // 목요일이 속한 달을 기준으로 "N월 M주"
  const weekName = (w) => {
    const th = toDate(addDays(w, 3));
    return `${th.getUTCMonth() + 1}월 ${Math.ceil(th.getUTCDate() / 7)}주`;
  };
  const stars = (n) => "★".repeat(n);
  const editorial = window.AIWeeklyEditorial;

  let data;
  try {
    // Actions가 노션에서 생성한 최신 공개 데이터를 매번 읽습니다.
    // 응답에 문제가 있으면 아래 catch에서 사용자에게 안내합니다.
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("데이터 응답 오류");
    data = await response.json();
  } catch (e) {
    $("weekLabel").textContent = "데이터를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.";
    return;
  }
  const { briefings, insights, keywordCounts, links } = data;
  const byId = new Map(insights.map((i) => [i.id, i]));

  const weekSet = new Set([...briefings.map((b) => b.week), ...keywordCounts.map((k) => k.week)]);
  const weeks = [...weekSet].sort();
  if (!weeks.length) {
    $("weekLabel").textContent = "아직 정리된 주간 기록이 없습니다.";
    return;
  }
  let wi = weeks.length - 1;
  let kwFilter = null;
  // 칸마다 [이 주] / [전체] 전환
  const mode = { core: "week", flips: "week", repos: "week", rumors: "week", videos: "week", news: "week" };
  function toggle(id, key, rerender) {
    $(id).innerHTML = ["week", "all"]
      .map((m) => `<button class="seg${mode[key] === m ? " on" : ""}" data-m="${m}" aria-pressed="${mode[key] === m}">${m === "week" ? "선택 주" : key === "core" ? "현재 유효" : "전체"}</button>`)
      .join("");
    $(id).querySelectorAll("button").forEach((b) => (b.onclick = () => { mode[key] = b.dataset.m; rerender(); }));
  }
  const weekEnd = (w) => addDays(w, 6);
  const STATUS_BADGE = { 지나감: "지금은 지나감", "부분 유효": "지금은 일부만 유효", "판정 보류": "판정 보류" };

  function renderWeek() {
    const w = weeks[wi];
    const b = briefings.find((x) => x.week === w);
    $("weekSelect").value = w;
    $("weekLabel").textContent = `${w.replaceAll("-", ".")} — ${weekEnd(w).replaceAll("-", ".")}`;
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
    const partial = keywordCounts.some((k) => k.week === w && !k.final);
    $("issueState").textContent = today >= w && today <= weekEnd(w) ? "진행 중인 주" : partial ? "부분 집계 기록" : "지난 주 기록";
    $("briefingPeriod").textContent = weekName(w);
    $("landPeriod").textContent = `${md(w)} ~ ${md(weekEnd(w))} 기록`;
    $("prevWeek").disabled = wi === 0;
    $("nextWeek").disabled = wi === weeks.length - 1;

    // 그래픽의 짧은 문구와 펼쳐 읽는 원문을 함께 만듭니다.
    $("briefing").innerHTML = editorial.renderBriefing(b?.briefing ?? []);

    const land = b?.landscape ?? {};
    $("landscape").innerHTML = ["코딩 주력", "가성비", "로컬", "요금제"]
      .map((k) => `<div><div class="k">${k}</div><div class="v">${esc(land[k] || "—")}</div></div>`)
      .join("");

    renderMetrics(w);
    renderKeywordMap(w);
    renderFlips();
    renderTopics(w);
    renderVideos(w);
    renderCore(w);
    renderRepos(w);
    renderNews(w);
    renderRumors(w);
  }

  function renderMetrics(w) {
    const prev = addDays(w, -7);
    const newNow = insights.filter((i) => inWeek(i.date, w)).length;
    const newPrev = insights.filter((i) => inWeek(i.date, prev)).length;
    const diff = newNow - newPrev;
    const top = insights.filter((i) => inWeek(i.date, w) && i.importance === 3);
    const stillValid = top.filter((i) => i.status === "유효").length;
    const passed = insights.filter((i) => inWeek(i.statusChangedAt, w) && (i.status === "지나감" || i.status === "부분 유효")).length;
    // 과거 상태를 복원할 이력이 없으므로, 현재 상태라는 기준을 분명히 표시합니다.
    const end = weekEnd(w);
    const pendingAt = insights.filter((i) => i.date <= end && i.status === "판정 보류");
    const partial = keywordCounts.some((k) => k.week === w && !k.final);
    // 설명을 의미 단위로 나누어, 좁은 칸에서도 단어 중간이 끊기지 않게 합니다.
    // 각 칸을 '이름 → 숫자 → 설명' 순서의 동일한 구조로 표시합니다.
    const m = [
      ["새 인사이트", newNow, partial ? ["부분 집계", "전주 비교 보류"] : [!weeks.includes(prev) ? "이전 주 집계 없음" : diff === 0 ? "지난주와 같음" : `지난주 대비 ${diff > 0 ? "+" : ""}${diff}`], partial || !weeks.includes(prev) ? "" : diff > 0 ? "up" : diff < 0 ? "down" : ""],
      ["이 주 핵심 ★★★", top.length, [top.length ? `지금도 유효 ${stillValid}개` : "핵심 보기 ↓"], "", "h-core"],
      ["판단 변경", passed, ["현재 상태 기준", "지나감·부분 유효"], "", "h-flip"],
      ["누적 보류", pendingAt.length, ["선택 주까지 작성", "현재 상태 기준"], ""],
    ];
    $("metrics").innerHTML = m
      .map(([label, count, lines, statusClass, jump]) => `<${jump ? "button" : "div"} class="metric" ${jump ? `data-jump="${jump}"` : ""}><div class="label">${esc(label)}</div><div class="num">${count}</div><div class="sub ${statusClass}">${lines.map((line) => `<span>${esc(line)}</span>`).join("")}</div></${jump ? "button" : "div"}>`)
      .join("");
    $("metrics").querySelectorAll("[data-jump]").forEach((el) => (el.onclick = () => $(el.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" })));
  }

  // ---------- 키워드 지도 ----------
  const GROUPS = {
    모델: { color: "var(--c4)", keys: ["Opus", "Sonnet", "GPT Sol", "Luna", "Astra", "Gemini", "중국 모델", "Jev"] },
    "방법론": { color: "var(--c1)", keys: ["하네스", "스킬", "에이전트"] },
    "도구·요금": { color: "var(--c3)", keys: ["요금제·한도", "코덱스", "클로드 코드", "dot"] },
    "인프라·보안": { color: "var(--c2)", keys: ["로컬·DGX", "보안", "벤치마크", "영상 생성"] },
  };
  const groupOf = (k) => Object.entries(GROUPS).find(([, g]) => g.keys.includes(k)) ?? ["기타", { color: "var(--c5)" }];
  $("kwlegend").innerHTML = Object.entries(GROUPS).map(([n, g]) => `<span><i style="background:${g.color}"></i>${n}</span>`).join("");

  function importanceOf(k, w) {
    const from = addDays(w, -27), to = addDays(w, 6);
    let pool = insights.filter((i) => i.keywords.includes(k) && i.status !== "지나감" && i.date >= from && i.date <= to);
    if (!pool.length) pool = insights.filter((i) => i.keywords.includes(k) && i.date <= to);
    if (!pool.length) return null;
    return pool.reduce((s, i) => s + i.importance, 0) / pool.length;
  }

  function renderKeywordMap(w) {
    $("keywordJump").hidden = !kwFilter;
    $("keywordJump").textContent = kwFilter ? `${kwFilter}의 판단 추적 보기 ↓` : "";
    const cur = keywordCounts.filter((k) => k.week === w);
    const prevMap = new Map(keywordCounts.filter((k) => k.week === addDays(w, -7)).map((k) => [k.keyword, k.count]));
    const partial = cur.some((k) => !k.final);
    const pts = cur
      .map((k) => ({ ...k, imp: importanceOf(k.keyword, w), prev: prevMap.get(k.keyword) }))
      .filter((p) => p.imp !== null && p.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    if (!pts.length) {
      $("kwmap").innerHTML = `<p class="empty">이 주에는 키워드 집계가 없어요.</p>`;
      return;
    }
    const W = 520, H = 380, L = 44, R = 24, T = 30, B = 36;
    // 글자 크기를 바꿀 때 겹침 계산도 같은 기준으로 바꿔야 합니다.
    // 13 → 11.5로 약 12% 줄이고, 원과 글자 사이 간격은 4 → 7로 늘립니다.
    const LABEL_FONT_SIZE = 11.5;
    const LABEL_GAP = 7;
    const TREND_WIDTH_ALLOWANCE = 24;
    const counts = pts.map((p) => p.count);
    // 평균 중요도는 대개 2~3 사이라 아래쪽이 비지 않게 범위를 데이터에 맞춘다
    const yMin = Math.max(1, Math.min(...pts.map((p) => p.imp)) - 0.2);
    const lo = Math.log(Math.min(...counts)), hi = Math.log(Math.max(...counts));
    // 언급량은 수십~수백으로 퍼져 있어 로그 눈금이 고르게 보인다
    const x = (c) => L + 24 + (hi === lo ? 0.5 : (Math.log(c) - lo) / (hi - lo)) * (W - L - R - 48);
    const y = (v) => T + ((3 - v) / (3 - yMin)) * (H - T - B);
    const r = (c) => 8 + (hi === lo ? 0.5 : (Math.log(c) - lo) / (hi - lo)) * 12;
    // 한글은 대략 글자 크기만큼, 영문은 그 60%만큼의 가로 폭을 차지합니다.
    // 끝에 붙는 화살표나 '신규' 표시가 겹치지 않도록 여유 폭도 더합니다.
    const labelW = (s) => [...s].reduce(
      (width, character) => width + LABEL_FONT_SIZE * (/[가-힣]/.test(character) ? 1 : 0.6),
      0,
    ) + TREND_WIDTH_ALLOWANCE;
    pts.forEach((p) => {
      p.cx = x(p.count); p.cy = y(p.imp); p.r = r(p.count); p.ty = p.cy;
      p.hw = Math.max(p.r, labelW(p.keyword) / 2); // 상자 반폭
      p.top = p.r + LABEL_GAP + LABEL_FONT_SIZE + 4; // 원과 글자를 합친 상자의 윗쪽 범위
    });
    // 원+라벨 상자가 겹치면 덜 겹친 축으로 밀어내고, 원래 높이(중요도) 쪽으로 조금씩 되돌린다
    for (let it = 0; it < 300; it++) {
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          const p = pts[a], q = pts[b];
          const ox = p.hw + q.hw - Math.abs(q.cx - p.cx);
          const [up, lowr] = p.cy < q.cy ? [p, q] : [q, p];
          const oy = (up.cy + up.r) - (lowr.cy - lowr.top) + 4;
          if (ox > 0 && oy > 0) {
            if (ox < oy * 1.5) {
              const s = q.cx >= p.cx ? 1 : -1;
              p.cx -= (s * ox) / 2; q.cx += (s * ox) / 2;
            } else {
              up.cy -= oy / 2; lowr.cy += oy / 2;
            }
          }
        }
      }
      pts.forEach((p) => {
        p.cy += (p.ty - p.cy) * 0.04;
        p.cx = Math.min(W - R - p.hw, Math.max(L + p.hw, p.cx));
        p.cy = Math.min(H - B - p.r, Math.max(T + p.top - 6, p.cy));
      });
    }
    const placed = pts;
    const trend = (p) => {
      if (p.prev === undefined || p.prev === 0) return p.prev === 0 ? `<tspan class="trend-up"> 신규</tspan>` : "";
      const ch = (p.count - p.prev) / p.prev;
      if (partial && ch < 0) return "";
      if (ch >= 0.2) return `<tspan class="trend-up"> ↑</tspan>`;
      if (ch <= -0.2) return `<tspan class="trend-down"> ↓</tspan>`;
      return "";
    };
    const ticks = [3, 2.5, 2, 1.5, 1].filter((v) => v >= yMin);
    const grid = ticks.map((v) => `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke-dasharray="3 4"/>${Number.isInteger(v) ? `<text class="axis-label" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${stars(v)}</text>` : ""}`).join("");
    const bubbles = placed
      .map((p) => {
        const [, g] = groupOf(p.keyword);
        const on = kwFilter === p.keyword ? " on" : "";
        const tip = `${p.keyword} · 언급 ${p.count}${p.prev !== undefined ? ` (지난주 ${p.prev})` : ""} · 평균 중요도 ${p.imp.toFixed(1)}`;
        return `<g><circle class="bubble${on}" role="button" tabindex="0" aria-label="${esc(tip)} · 판단 추적 필터" aria-pressed="${Boolean(on)}" data-k="${esc(p.keyword)}" cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${g.color}"><title>${esc(tip)}</title></circle>
          <text class="lab" x="${p.cx}" y="${p.cy - p.r - LABEL_GAP}" text-anchor="middle">${esc(p.keyword)}${trend(p)}</text></g>`;
      })
      .join("");
    $("kwmap").innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="--keyword-label-size:${LABEL_FONT_SIZE}px" role="group" aria-label="키워드별 언급량과 중요도">
      <text class="axis-title" x="${L}" y="14">평균 중요도</text>
      ${grid}
      <line class="axis" x1="${L}" x2="${W - R}" y1="${H - B + 6}" y2="${H - B + 6}"/>
      <text class="axis-label" x="${W - R}" y="${H - 8}" text-anchor="end">언급량 많음 →${partial ? " (이번 주는 집계 중)" : ""}</text>
      ${bubbles}</svg>`;
    $("kwmap").querySelectorAll(".bubble").forEach((el) => {
      el.onclick = () => {
        kwFilter = kwFilter === el.dataset.k ? null : el.dataset.k;
        renderKeywordMap(weeks[wi]);
        renderFlips();
      };
      el.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          el.onclick();
          $("kwmap").querySelector(`[data-k="${CSS.escape(el.dataset.k)}"]`)?.focus();
        }
      };
    });
  }

  // ---------- 뒤집힌 판단 ----------
  function renderFlips() {
    let pairs = insights
      .filter((i) => i.replacedBy.length && (i.status === "지나감" || i.status === "부분 유효") && i.kind !== "루머·미검증")
      .flatMap((old) => old.replacedBy.map((id) => byId.get(id)).filter(Boolean).map((nw) => ({ old, nw })));
    const w = weeks[wi];
    toggle("tg-flips", "flips", renderFlips);
    if (mode.flips === "week") pairs = pairs.filter(({ old, nw }) => inWeek(old.statusChangedAt || nw.date, w));
    if (kwFilter) pairs = pairs.filter(({ old, nw }) => old.keywords.includes(kwFilter) || nw.keywords.includes(kwFilter));
    pairs.sort((a, b) => (b.old.statusChangedAt ?? "").localeCompare(a.old.statusChangedAt ?? ""));
    $("flipFilter").innerHTML = kwFilter ? `<button class="chip" id="clearKw">${esc(kwFilter)} ✕</button>` : "";
    if ($("clearKw")) $("clearKw").onclick = () => { kwFilter = null; renderKeywordMap(weeks[wi]); renderFlips(); };
    $("flips").innerHTML = pairs.length
      ? editorial.renderChanges(pairs.slice(0, 6))
      : `<p class="empty">${mode.flips === "week" ? `${weekName(w)}에는 ` : ""}${kwFilter ? "이 키워드로 " : ""}뒤집힌 판단이 없어요.${mode.flips === "week" ? " [전체]에서 지난 기록을 볼 수 있어요." : ""}</p>`;
  }

  // ---------- 지금 유효한 핵심 ----------
  let coreOpen = false;
  function renderCore(w = weeks[wi]) {
    toggle("tg-core", "core", () => { coreOpen = false; renderCore(); });
    const week = mode.core === "week";
    $("h-core-title").textContent = week ? `${weekName(w)} 핵심` : "지금 유효한 핵심";
    // 이 주: 그 주에 나온 ★★★·★★ (지금 상태 배지 표시) / 전체: 지금도 유효한 ★★★
    const list = week
      ? insights.filter((i) => inWeek(i.date, w) && i.importance >= 2).sort((a, b) => b.importance - a.importance || b.date.localeCompare(a.date))
      : insights.filter((i) => i.status === "유효" && i.importance === 3).sort((a, b) => b.date.localeCompare(a.date));
    $("coreCount").textContent = `${list.length}개 기록`;
    if (!list.length) {
      $("core").innerHTML = `<p class="empty">정리된 핵심이 없어요. [현재 유효]에서 다른 기록을 볼 수 있어요.</p>`;
      $("coreMore").hidden = true;
      return;
    }
    const draw = () => {
      const open = coreOpen;
      const shown = open ? list : list.slice(0, 6);
      $("core").innerHTML = shown.map((i) => `<article class="icard">
          <div>${i.topics.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}${week && STATUS_BADGE[i.status] ? ` <span class="tag warn">${STATUS_BADGE[i.status]}</span>` : ""}</div>
          <h3>${esc(i.title)}</h3>
          ${i.summary ? `<p>${esc(i.summary.length > 100 ? i.summary.slice(0, 100).trimEnd() + "…" : i.summary)}</p>${i.summary.length > 100 ? `<details class="story-detail"><summary>기록 전체 읽기</summary><p>${esc(i.summary)}</p></details>` : ""}` : ""}
          <div class="meta">${stars(i.importance)} · ${esc(i.kind ?? "")} · ${md(i.date)}</div>
        </article>`).join("");
      $("coreMore").hidden = list.length <= 6;
      $("coreMore").textContent = open ? "접기" : `더 보기 (${list.length - 6}개)`;
    };
    $("coreMore").onclick = () => { coreOpen = !coreOpen; draw(); };
    draw();
  }

  // ---------- 주제 비중 ----------
  const TOPIC_COLORS = ["var(--c1)", "var(--c4)", "var(--c3)", "var(--c2)"];
  function renderTopics(w) {
    const ws = weeks.filter((x) => x <= w).slice(-6);
    const nIns = ws.map((wk) => insights.filter((i) => inWeek(i.date, wk)).length);
    const counts = ws.map((wk) => {
      const c = {};
      insights.filter((i) => inWeek(i.date, wk)).forEach((i) => i.topics.forEach((t) => (c[t] = (c[t] || 0) + 1)));
      return c;
    });
    const total = {};
    counts.forEach((c) => Object.entries(c).forEach(([t, n]) => (total[t] = (total[t] || 0) + n)));
    const top = Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
    $("topics").innerHTML = ws.map((wk, idx) => {
      const c = counts[idx];
      const sum = Object.values(c).reduce((a, b) => a + b, 0);
      const segs = top.map((t, j) => [c[t] || 0, TOPIC_COLORS[j], t]);
      segs.push([sum - segs.reduce((a, s) => a + s[0], 0), "var(--c5)", "기타"]);
      const bar = sum ? segs.filter((s) => s[0] > 0).map(([n, col, t]) => `<div style="width:${(n / sum) * 100}%;background:${col}" title="${esc(t)} ${n}"></div>`).join("") : "";
      return `<span class="${wk === w ? "cur" : ""}">${weekName(wk)}</span><div class="bar">${bar}</div><span>${nIns[idx]}</span>`;
    }).join("");
    $("topicLegend").innerHTML = [...top.map((t, j) => [t, TOPIC_COLORS[j]]), ["기타", "var(--c5)"]]
      .map(([t, c]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join("") + `<span>· 오른쪽 숫자는 그 주의 인사이트 수</span>`;
  }

  // ---------- 영상 ----------
  function ytId(u) {
    const m = u.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  // 선택한 주에 공유된 영상: 「대시보드 노출」 → 중요도 → 최신 순으로 3개, 나머지는 제목만
  function renderVideos(w = weeks[wi]) {
    toggle("tg-videos", "videos", () => renderVideos());
    const week = mode.videos === "week";
    const all = links.filter((l) => l.kind === "영상" && ytId(l.url) && (!week || inWeek(l.date, w)))
      .sort((a, b) => b.featured - a.featured || b.importance - a.importance || (b.date ?? "").localeCompare(a.date ?? ""));
    const vids = all.slice(0, 3);
    const rest = all.slice(3);
    $("h-video").textContent = week ? `${weekName(w)} 추천 영상` : "전체 추천 영상";
    $("videoMoreWrap").hidden = !rest.length;
    $("videoMoreWrap").open = false;
    $("videoRestCount").textContent = `(${rest.length})`;
    $("videoMore").innerHTML = rest.length
      ? `<ul class="rows">${rest.map((v) => `<li><span class="body"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a><span class="sub">${esc(v.reason)}</span></span></li>`).join("")}</ul>`
      : "";
    if (!vids.length) {
      $("videos").innerHTML = `<p class="empty">이 주에는 공유된 영상이 없어요.</p>`;
      return;
    }
    $("videos").innerHTML = vids.map((v) => {
      const id = ytId(v.url);
      return `<div class="video">
        <div class="frame" data-id="${id}">
          <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">
          <button aria-label="${esc(v.title)} 재생"><span>▶</span></button>
        </div>
        <h3>${esc(v.title)}</h3>
        <p>${esc(v.reason)}</p>
      </div>`;
    }).join("");
    $("videos").querySelectorAll(".frame").forEach((f) => {
      f.querySelector("button").onclick = () => {
        f.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${f.dataset.id}?autoplay=1" title="YouTube 영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      };
    });
  }

  // ---------- 깃 저장소 ----------
  function renderRepos(w = weeks[wi]) {
    toggle("tg-repos", "repos", () => renderRepos());
    const week = mode.repos === "week";
    const repos = links.filter((l) => l.kind === "깃허브" && (!week || inWeek(l.date, w)))
      .sort((a, b) => b.importance - a.importance || (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 8);
    if (!repos.length) {
      $("repos").innerHTML = `<li class="empty">${week ? `${weekName(w)}에 공유된 저장소가 없어요. [전체]에서 볼 수 있어요.` : "아직 없어요."}</li>`;
      return;
    }
    $("repos").innerHTML = repos.length
      ? repos.map((r) => {
          const name = (r.url.match(/github\.com\/([^/]+\/[^/#?]+)/) || [])[1] ?? r.title;
          return `<li><span class="tag">${stars(r.importance)}</span><span class="body"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(name)}</a><span class="sub">${esc(r.reason)}</span></span></li>`;
        }).join("")
      : `<li class="empty">아직 없어요.</li>`;
  }

  // ---------- 뉴스 레이더 (GeekNews Weekly에서 고른 글) ----------
  // 위클리는 지난 한 주의 뉴스를 다음 주에 보내므로, 날짜는 그 뉴스가 다룬 주의 월요일로 저장되어 있습니다.
  function renderNews(w = weeks[wi]) {
    toggle("tg-news", "news", () => renderNews());
    const week = mode.news === "week";
    const items = links.filter((l) => l.kind === "뉴스" && (!week || inWeek(l.date, w)))
      .sort((a, b) => b.echoed - a.echoed || b.importance - a.importance || (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, week ? 12 : 16);
    $("news").innerHTML = items.length
      ? items.map((n) => `<li><span class="tag">${stars(n.importance)}</span><span class="body"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>${n.echoed ? ` <span class="tag echo">대화에서도</span>` : ""}<span class="sub">${esc(n.reason)}</span></span></li>`).join("")
      : `<li class="empty">${week ? `${weekName(w)} 뉴스는 아직 없어요. GeekNews Weekly는 지난주 뉴스를 다음 주에 보내요. [전체]에서 볼 수 있어요.` : "아직 고른 뉴스가 없어요."}</li>`;
  }

  // ---------- 루머 채점표 ----------
  function renderRumors(w = weeks[wi]) {
    toggle("tg-rumors", "rumors", () => renderRumors());
    const week = mode.rumors === "week";
    // 이 주: 그 주에 나왔거나 그 주에 결론이 난 루머
    const list = insights.filter((i) => i.rumorResult && (!week || inWeek(i.date, w) || inWeek(i.statusChangedAt, w)));
    const order = { 적중: 0, 빗나감: 0, 대기: 1 };
    list.sort((a, b) => order[a.rumorResult] - order[b.rumorResult] || (b.statusChangedAt ?? b.date).localeCompare(a.statusChangedAt ?? a.date));
    const n = (r) => list.filter((i) => i.rumorResult === r).length;
    $("rumorSummary").textContent = list.length ? `적중 ${n("적중")} · 빗나감 ${n("빗나감")} · 결과 대기 ${n("대기")}` : "";
    const cls = { 적중: "ok", 빗나감: "bad", 대기: "wait" };
    $("rumors").innerHTML = list.length
      ? list.slice(0, 8).map((i) => `<li><span class="res ${cls[i.rumorResult]}">${i.rumorResult}</span><span class="body">${esc(i.title)}<span class="sub">${md(i.date)}</span></span></li>`).join("")
      : `<li class="empty">${week ? `${weekName(w)}에 나오거나 결론 난 루머가 없어요.` : "아직 채점할 루머가 없어요."}</li>`;
  }

  // ---------- 시작 (상수 선언이 모두 끝난 뒤에 그린다) ----------
  $("generated").textContent = `데이터 갱신 ${new Date(data.generatedAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })} (한국 시간)`;
  $("updatedAt").textContent = new Date(data.generatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }) + " 갱신";
  $("weekSelect").innerHTML = [...weeks].reverse().map((w) => `<option value="${w}">${weekName(w)} · ${md(w)}–${md(weekEnd(w))}</option>`).join("");
  // 주차를 바꾸면 이전 키워드 필터와 펼친 목록을 초기화합니다.
  function changeWeek(index) {
    wi = index;
    kwFilter = null;
    coreOpen = false;
    renderWeek();
  }
  $("prevWeek").onclick = () => { if (wi > 0) changeWeek(wi - 1); };
  $("nextWeek").onclick = () => { if (wi < weeks.length - 1) changeWeek(wi + 1); };
  $("weekSelect").onchange = (event) => changeWeek(weeks.indexOf(event.target.value));
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("themeToggle").textContent = theme === "dark" ? "밝은 배경" : "어두운 배경";
  }
  try { setTheme(localStorage.getItem("ai-weekly-theme") === "light" ? "light" : "dark"); } catch { setTheme("dark"); }
  $("themeToggle").onclick = () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(theme);
    try { localStorage.setItem("ai-weekly-theme", theme); } catch { /* 파일 미리보기에서 저장이 제한되어도 화면은 변경합니다. */ }
  };
  renderWeek();
})();
