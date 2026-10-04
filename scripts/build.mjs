// 노션 DB 4개를 읽어 닉네임을 걸러낸 공개용 site/data.json 을 만든다.
// 실행: NOTION_TOKEN=ntn_... node scripts/build.mjs
import { writeFile, mkdir } from "node:fs/promises";

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) {
  console.error("NOTION_TOKEN 환경변수가 없습니다.");
  process.exit(1);
}

const DB = {
  insights: "6605541065e240b08d8158322fdd9ea6",
  links: "fb8f50c3451b4202897cfbe2c0b85532",
  keywords: "eaf7cde368e741d9acd15a8c9fcb4c21",
  briefings: "5ffe1d6ed4524809be11ee1a929e5218",
};
const NAME_FILTER_PAGE = "3ee8fc09deb98194b21fee32c0a63000";

async function notion(path, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.notion.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
    return res.json();
  }
  throw new Error(`${path} → 재시도 초과`);
}

async function queryAll(dbId) {
  const rows = [];
  let cursor;
  do {
    const r = await notion(`databases/${dbId}/query`, { page_size: 100, start_cursor: cursor });
    rows.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return rows;
}

const text = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join("").trim();
const sel = (p) => p?.select?.name ?? null;
const multi = (p) => (p?.multi_select ?? []).map((o) => o.name);
const date = (p) => p?.date?.start?.slice(0, 10) ?? null;
const check = (p) => p?.checkbox === true;
const rel = (p) => (p?.relation ?? []).map((r) => r.id.replaceAll("-", ""));
const stars = (s) => (s ? s.length : 0);

// ---- 이름 필터 ----
async function loadNames() {
  const names = new Set();
  const schema = await notion(`databases/${DB.insights}`);
  for (const o of schema.properties["인물"]?.multi_select?.options ?? []) {
    if (o.name !== "기타") names.add(o.name);
  }
  const blocks = await notion(`blocks/${NAME_FILTER_PAGE}/children?page_size=100`);
  for (const b of blocks.results) {
    const rt = b[b.type]?.rich_text;
    if (b.type === "code" && rt) {
      rt.map((t) => t.plain_text).join("").split("\n").map((s) => s.trim()).filter(Boolean).forEach((n) => names.add(n));
    }
  }
  // 긴 이름부터 지워야 "김민준/AI/서울/중3" 이 "김민준" 보다 먼저 처리된다
  return [...names].sort((a, b) => b.length - a.length);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
// 앞뒤가 한글·영문이 아닌 자리에서만 이름으로 본다 ("아키텍처"의 "아키"는 건드리지 않음)
const nameRe = (n) => new RegExp(`(?<![가-힣A-Za-z0-9])${esc(n)}(?![가-힣A-Za-z0-9])`, "g");
const nameWithJosaRe = (n) => new RegExp(`(?<![가-힣A-Za-z0-9])${esc(n)}(의|는|은|이|가)?(?=[\\s:·,)」]|$)`, "g");

function makeSanitizer(names) {
  const res = names.map((n) => [nameRe(n), nameWithJosaRe(n)]);
  return function sanitize(s) {
    if (!s) return s;
    // 1) 괄호 안: 이름만 지우고, 남는 게 없으면 괄호째 지운다
    s = s.replace(/\(([^()]*)\)/g, (m, inner) => {
      let rest = inner;
      for (const [re] of res) rest = rest.replace(re, "");
      rest = rest.replace(/^[\s·,/]+|[\s·,/]+$/g, "").replace(/\s*[·,]\s*[·,]\s*/g, ", ");
      return rest ? `(${rest})` : "";
    });
    // 2) 본문: "곰의 ", "호잇쨔 서열:", "VCU 주영준 「" 같은 이름(+조사)을 지운다
    for (const [, re] of res) s = s.replace(re, "");
    return s.replace(/\s{2,}/g, " ").replace(/\s+([.,:」)])/g, "$1").replace(/^[\s:·,]+/, "").trim();
  };
}

function leakCheck(obj, names) {
  const json = JSON.stringify(obj);
  const found = names.filter((n) => nameRe(n).test(json));
  if (found.length) {
    console.error(`이름이 걸러지지 않았습니다: ${found.join(", ")}`);
    process.exit(2);
  }
}

// ---- 빌드 ----
const names = await loadNames();
const clean = makeSanitizer(names);
const [insRows, linkRows, kwRows, brRows] = await Promise.all(Object.values(DB).map(queryAll));

const insights = insRows
  .map((r) => ({ id: r.id.replaceAll("-", ""), p: r.properties }))
  .filter(({ p }) => !check(p["블로그 제외"]))
  .map(({ id, p }) => ({
    id,
    title: clean(text(p["인사이트"])),
    summary: clean(text(p["요약"])),
    date: date(p["날짜"]),
    topics: multi(p["주제"]),
    kind: sel(p["종류"]),
    importance: stars(sel(p["중요도"])),
    status: sel(p["상태"]),
    keywords: multi(p["키워드"]),
    statusChangedAt: date(p["상태 변경일"]),
    rumorResult: sel(p["루머 결과"]),
    replacedBy: rel(p["대체한 인사이트"]),
  }))
  .filter((i) => i.title && i.date)
  .sort((a, b) => b.date.localeCompare(a.date));

const links = linkRows
  .map((r) => r.properties)
  .filter((p) => !check(p["블로그 제외"]) && p["URL"]?.url)
  .map((p) => ({
    title: clean(text(p["제목"])),
    url: p["URL"].url,
    kind: sel(p["종류"]),
    importance: stars(sel(p["중요도"])),
    topics: multi(p["주제"]),
    date: date(p["날짜"]),
    reason: clean(text(p["추천 이유"])),
    featured: check(p["대시보드 노출"]),
    source: sel(p["출처"]),
    echoed: check(p["방에서도 언급"]),
    keywords: multi(p["키워드"]),
  }));

const keywordCounts = kwRows
  .map((r) => r.properties)
  .map((p) => ({ week: date(p["주 시작일"]), keyword: sel(p["키워드"]), count: p["언급수"]?.number ?? 0, final: check(p["집계 완료"]) }))
  .filter((k) => k.week && k.keyword);

const briefings = brRows
  .map((r) => r.properties)
  .filter((p) => check(p["발행"]))
  .map((p) => ({
    title: text(p["주차"]),
    week: date(p["주 시작일"]),
    briefing: [text(p["브리핑 1"]), text(p["브리핑 2"]), text(p["브리핑 3"])].map(clean).filter(Boolean),
    landscape: { "코딩 주력": clean(text(p["코딩 주력"])), 가성비: clean(text(p["가성비"])), 로컬: clean(text(p["로컬"])), 요금제: clean(text(p["요금제"])) },
  }))
  .filter((b) => b.week)
  .sort((a, b) => a.week.localeCompare(b.week));

const data = { generatedAt: new Date().toISOString(), briefings, insights, keywordCounts, links };
leakCheck(data, names);
await mkdir("site", { recursive: true });
await writeFile("site/data.json", JSON.stringify(data));
console.log(`완료: 인사이트 ${insights.length}, 링크 ${links.length}, 키워드 ${keywordCounts.length}, 브리핑 ${briefings.length} (이름 ${names.length}개 필터)`);
