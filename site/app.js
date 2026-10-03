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

  let data;
  try {
    data = await (await fetch("data.json", { cache: "no-store" })).json();
  } catch (e) {
    $("weekLabel").textContent = "데이터를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.";
    return;
  }
  const { briefings, insights, keywordCounts, links } = data;
  const byId = new Map(insights.map((i) => [i.id, i]));

  const weekSet = new Set([...briefings.map((b) => b.week), ...keywordCounts.map((k) => k.week)]);
  const weeks = [...weekSet].sort();
  let wi = weeks.length - 1;
  let kwFilter = null;

  function renderWeek() {
    const w = weeks[wi];
    const b = briefings.find((x) => x.week === w);
    $("weekTitle").textContent = weekName(w);
    $("weekLabel").textContent = `${md(w)} ~ ${md(addDays(w, 6))}${wi === weeks.length - 1 ? " · 진행 중인 주" : ""}`;
    $("prevWeek").disabled = wi === 0;
    $("nextWeek").disabled = wi === weeks.length - 1;

    $("briefing").innerHTML = b?.briefing.length
      ? b.briefing.map((t) => `<li>${esc(t)}</li>`).join("")
      : `<li class="empty">이 주에는 브리핑이 없어요.</li>`;

    const land = b?.landscape ?? {};
    $("landscape").innerHTML = ["코딩 주력", "가성비", "로컬", "요금제"]
      .map((k) => `<div><div class="k">${k}</div><div class="v">${esc(land[k] || "—")}</div></div>`)
      .join("");

    renderMetrics(w);
    renderKeywordMap(w);
    renderFlips();
    renderTopics(w);
    renderVideos(w);
  }

  function renderMetrics(w) {
    const prev = addDays(w, -7);
    const newNow = insights.filter((i) => inWeek(i.date, w)).length;
    const newPrev = insights.filter((i) => inWeek(i.date, prev)).length;
    const diff = newNow - newPrev;
    const core = insights.filter((i) => i.status === "유효" && i.importance === 3).length;
    const passed = insights.filter((i) => inWeek(i.statusChangedAt, w) && (i.status === "지나감" || i.status === "부분 유효")).length;
    const pending = insights.filter((i) => i.status === "판정 보류").length;
    const m = [
      ["새 인사이트", newNow, diff === 0 ? "지난주와 같음" : `지난주 대비 ${diff > 0 ? "+" : ""}${diff}`, diff > 0 ? "up" : diff < 0 ? "down" : ""],
      ["지금 유효 ★★★", core, `전체 ${insights.length}개 중`, "", "h-core"],
      ["이번 주 지나감", passed, "뒤집힌 판단 보기 ↓", "", "h-flip"],
      ["판정 보류", pending, "루머 채점표 ↓", "", "h-rumor"],
    ];
    $("metrics").innerHTML = m
      .map(([l, n, s, cls, jump]) => `<button class="metric" ${jump ? `data-jump="${jump}"` : "disabled"}><div class="label">${l}</div><div class="num">${n}</div><div class="sub ${cls}">${s}</div></button>`)
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
    if (!pool.length) pool = insights.filter((i) => i.keywords.includes(k));
    if (!pool.length) return null;
    return pool.reduce((s, i) => s + i.importance, 0) / pool.length;
  }

  function renderKeywordMap(w) {
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
    const counts = pts.map((p) => p.count);
    // 평균 중요도는 대개 2~3 사이라 아래쪽이 비지 않게 범위를 데이터에 맞춘다
    const yMin = Math.max(1, Math.min(...pts.map((p) => p.imp)) - 0.2);
    const lo = Math.log(Math.min(...counts)), hi = Math.log(Math.max(...counts));
    // 언급량은 수십~수백으로 퍼져 있어 로그 눈금이 고르게 보인다
    const x = (c) => L + 24 + (hi === lo ? 0.5 : (Math.log(c) - lo) / (hi - lo)) * (W - L - R - 48);
    const y = (v) => T + ((3 - v) / (3 - yMin)) * (H - T - B);
    const r = (c) => 8 + (hi === lo ? 0.5 : (Math.log(c) - lo) / (hi - lo)) * 12;
    // 라벨 글자 폭을 대략 잡는다 (한글 14px, 영문·숫자 8px)
    const labelW = (s) => [...s].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 14 : 8), 0) + 16;
    pts.forEach((p) => {
      p.cx = x(p.count); p.cy = y(p.imp); p.r = r(p.count); p.ty = p.cy;
      p.hw = Math.max(p.r, labelW(p.keyword) / 2); // 상자 반폭
      p.top = p.r + 20; // 원 중심에서 라벨 윗단까지
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
        return `<g><circle class="bubble${on}" data-k="${esc(p.keyword)}" cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${g.color}"><title>${esc(tip)}</title></circle>
          <text class="lab" x="${p.cx}" y="${p.cy - p.r - 4}" text-anchor="middle">${esc(p.keyword)}${trend(p)}</text></g>`;
      })
      .join("");
    $("kwmap").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="키워드별 언급량과 중요도">
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
    });
  }

  // ---------- 뒤집힌 판단 ----------
  function renderFlips() {
    let pairs = insights
      .filter((i) => i.replacedBy.length && (i.status === "지나감" || i.status === "부분 유효") && i.kind !== "루머·미검증")
      .flatMap((old) => old.replacedBy.map((id) => byId.get(id)).filter(Boolean).map((nw) => ({ old, nw })));
    if (kwFilter) pairs = pairs.filter(({ old, nw }) => old.keywords.includes(kwFilter) || nw.keywords.includes(kwFilter));
    pairs.sort((a, b) => (b.old.statusChangedAt ?? "").localeCompare(a.old.statusChangedAt ?? ""));
    $("flipFilter").innerHTML = kwFilter ? `<button class="chip" id="clearKw">${esc(kwFilter)} ✕</button>` : "";
    if ($("clearKw")) $("clearKw").onclick = () => { kwFilter = null; renderKeywordMap(weeks[wi]); renderFlips(); };
    $("flips").innerHTML = pairs.length
      ? pairs.slice(0, 6).map(({ old, nw }) => `<div class="flip">
          <div class="old">${esc(old.title)}</div>
          <div class="new">${esc(nw.title)}</div>
          <div class="meta">${md(old.statusChangedAt || nw.date)} · ${old.status === "부분 유효" ? "일부만 유효" : "지나감"}${old.keywords.length ? " · " + esc(old.keywords.join(", ")) : ""}</div>
        </div>`).join("")
      : `<p class="empty">${kwFilter ? "이 키워드로 뒤집힌 판단은 아직 없어요." : "아직 뒤집힌 판단이 없어요."}</p>`;
  }

  // ---------- 지금 유효한 핵심 ----------
  function renderCore() {
    const list = insights.filter((i) => i.status === "유효" && i.importance === 3);
    let open = false;
    const draw = () => {
      const shown = open ? list : list.slice(0, 6);
      $("core").innerHTML = shown.map((i) => `<article class="icard">
          <div>${i.topics.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</div>
          <h3>${esc(i.title)}</h3>
          ${i.summary ? `<p>${esc(i.summary)}</p>` : ""}
          <div class="meta">${stars(i.importance)} · ${esc(i.kind ?? "")} · ${md(i.date)}</div>
        </article>`).join("");
      $("coreMore").hidden = list.length <= 6;
      $("coreMore").textContent = open ? "접기" : `더 보기 (${list.length - 6}개)`;
    };
    $("coreMore").onclick = () => { open = !open; draw(); };
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
  function renderVideos(w) {
    const all = links.filter((l) => l.kind === "영상" && ytId(l.url) && inWeek(l.date, w))
      .sort((a, b) => b.featured - a.featured || b.importance - a.importance || (b.date ?? "").localeCompare(a.date ?? ""));
    const vids = all.slice(0, 3);
    const rest = all.slice(3);
    $("h-video").textContent = `${weekName(w)} 추천 영상`;
    $("videoMore").innerHTML = rest.length
      ? `<p class="small muted">이 주에 공유된 다른 영상</p><ul class="rows">${rest.map((v) => `<li><span class="body"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a><span class="sub">${esc(v.reason)}</span></span></li>`).join("")}</ul>`
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
  function renderRepos() {
    const repos = links.filter((l) => l.kind === "깃허브")
      .sort((a, b) => b.importance - a.importance || (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 8);
    $("repos").innerHTML = repos.length
      ? repos.map((r) => {
          const name = (r.url.match(/github\.com\/([^/]+\/[^/#?]+)/) || [])[1] ?? r.title;
          return `<li><span class="tag">${stars(r.importance)}</span><span class="body"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(name)}</a><span class="sub">${esc(r.reason)}</span></span></li>`;
        }).join("")
      : `<li class="empty">아직 없어요.</li>`;
  }

  // ---------- 루머 채점표 ----------
  function renderRumors() {
    const list = insights.filter((i) => i.rumorResult);
    const order = { 적중: 0, 빗나감: 0, 대기: 1 };
    list.sort((a, b) => order[a.rumorResult] - order[b.rumorResult] || (b.statusChangedAt ?? b.date).localeCompare(a.statusChangedAt ?? a.date));
    const n = (r) => list.filter((i) => i.rumorResult === r).length;
    $("rumorSummary").textContent = list.length ? `적중 ${n("적중")} · 빗나감 ${n("빗나감")} · 결과 대기 ${n("대기")}` : "";
    const cls = { 적중: "ok", 빗나감: "bad", 대기: "wait" };
    $("rumors").innerHTML = list.length
      ? list.slice(0, 8).map((i) => `<li><span class="res ${cls[i.rumorResult]}">${i.rumorResult}</span><span class="body">${esc(i.title)}<span class="sub">${md(i.date)}</span></span></li>`).join("")
      : `<li class="empty">아직 채점할 루머가 없어요.</li>`;
  }

  // ---------- 시작 (상수 선언이 모두 끝난 뒤에 그린다) ----------
  renderCore();
  renderRepos();
  renderRumors();
  $("generated").textContent = `마지막 갱신 ${new Date(data.generatedAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}`;
  $("prevWeek").onclick = () => { if (wi > 0) { wi--; renderWeek(); } };
  $("nextWeek").onclick = () => { if (wi < weeks.length - 1) { wi++; renderWeek(); } };
  renderWeek();
})();
