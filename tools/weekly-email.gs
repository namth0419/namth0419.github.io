/**
 * Research Planner · 주간 메일 (Google Apps Script)
 *
 * 매주 월요일 아침에 플래너(Firestore)를 읽어서
 *   이번 주 목표 · 이번 달 진행 · 다가오는 마감 · 원고 현황 · 지난주 회고
 * 를 메일로 보냅니다. 본인 Google 계정으로 실행되므로 비밀번호나 키를 따로 만들지 않습니다.
 *
 * 설치
 *   1. https://script.google.com 에서 "새 프로젝트"
 *   2. Code.gs 내용을 이 파일로 바꾸기
 *   3. 왼쪽 톱니바퀴(프로젝트 설정) → "appsscript.json 매니페스트 파일 표시" 체크 →
 *      appsscript.json 을 아래 MANIFEST 주석의 내용으로 바꾸기
 *   4. 위쪽 함수 선택에서 setup 을 골라 실행 → 권한 허용 (처음 한 번)
 *      → 시험 메일이 바로 한 통 오고, 이후 매주 월요일 8시에 자동 발송
 *
 * MANIFEST (appsscript.json)
 * {
 *   "timeZone": "Asia/Seoul",
 *   "runtimeVersion": "V8",
 *   "exceptionLogging": "STACKDRIVER",
 *   "oauthScopes": [
 *     "https://www.googleapis.com/auth/datastore",
 *     "https://www.googleapis.com/auth/script.external_request",
 *     "https://www.googleapis.com/auth/script.send_mail",
 *     "https://www.googleapis.com/auth/script.scriptapp",
 *     "https://www.googleapis.com/auth/userinfo.email"
 *   ]
 * }
 */

const TO = "";                       // 받을 주소. 비워두면 이 스크립트를 실행한 Google 계정으로 보냄
const TZ = "Asia/Seoul";             // 기준 시간대. 미국에 있을 땐 "America/New_York"
const SEND_HOUR = 8;                 // 월요일 몇 시에 보낼지
const PROJECT = "namth0419";         // Firebase 프로젝트 ID
const PLANNER_URL = "https://namth0419.github.io/planner/";

/* ---------- 설치: 매주 월요일 발송 예약 + 시험 메일 ---------- */
function setup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "sendWeekly")
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sendWeekly").timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(SEND_HOUR).inTimezone(TZ).create();
  sendWeekly();
}

/* ---------- Firestore 읽기 ---------- */
function loadItems() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const res = UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "X-Goog-User-Project": PROJECT },
    payload: JSON.stringify({ structuredQuery: { from: [{ collectionId: "items", allDescendants: true }] } })
  });
  if (res.getResponseCode() !== 200) throw new Error("플래너 데이터를 읽지 못했습니다: " + res.getContentText());
  return JSON.parse(res.getContentText()).filter(r => r.document)
    .map(r => Object.assign({ id: r.document.name.split("/").pop() }, fields(r.document.fields || {})));
}
function fields(f) { const o = {}; for (const k in f) o[k] = value(f[k]); return o; }
function value(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(value);
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  return null;
}

/* ---------- 날짜 (모두 "YYYY-MM-DD" 문자열) ---------- */
const D = s => new Date(s + "T00:00:00Z");
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const mondayOf = s => addDays(s, -((D(s).getUTCDay() + 6) % 7));
const md = s => `${+s.slice(5, 7)}.${+s.slice(8, 10)}`;
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5);
function isoWeek(mon) {
  const th = D(addDays(mon, 3)), jan1 = Date.UTC(th.getUTCFullYear(), 0, 1);
  return Math.floor(Math.round((th - jan1) / 864e5) / 7) + 1;
}
const startMs = s => Date.parse(s + "T00:00:00" + Utilities.formatDate(D(s), TZ, "XXX"));   // TZ 기준 그날 0시

/* ---------- 메일 ---------- */
const STAGE = { draft: "작성 중", submitted: "투고", review: "리뷰 중", revision: "리비전", accepted: "게재 확정", published: "출판" };
const KIND = { milestone: "마일스톤", month: "월간", week: "주간", day: "일간", paper: "원고", sample: "실험" };
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dd = n => n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`;

function sendWeekly() {
  const items = loadItems();
  const byId = {};
  items.forEach(i => { byId[i.id] = i; });
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const mon = mondayOf(today), sun = addDays(mon, 6), lastMon = addDays(mon, -7);
  const thu = addDays(mon, 3), month = thu.slice(0, 7);
  const due = i => i.kind === "milestone" ? (i.end || "") : (i.due || "");
  const parentOf = i => { const p = i.parent && byId[i.parent]; return p ? ` <span style="color:#888">↳ ${esc(p.title)}</span>` : ""; };

  const week = items.filter(i => i.kind === "week" && i.period === mon);
  const carried = items.filter(i => i.kind === "week" && i.period === lastMon && !i.done);
  const monthGoals = items.filter(i => i.kind === "month" && i.period === month);
  const soon = items.filter(i => !i.done && due(i) && i.kind !== "review" && due(i) <= addDays(today, 14))
                    .sort((a, b) => due(a) < due(b) ? -1 : 1);
  const papers = items.filter(i => i.kind === "paper" && (i.paper || {}).stage !== "published")
                      .sort((a, b) => Object.keys(STAGE).indexOf((b.paper || {}).stage) - Object.keys(STAGE).indexOf((a.paper || {}).stage));
  const review = items.find(i => i.kind === "review" && i.period === lastMon);
  const t0 = startMs(lastMon), t1 = startMs(mon);
  const lastDone = items.filter(i => i.done && i.doneAt >= t0 && i.doneAt < t1 && i.kind !== "review").length;

  const H = [];
  const sec = (title, body) => H.push(`<h3 style="font:600 13px sans-serif;letter-spacing:.06em;color:#555;margin:22px 0 6px;border-bottom:1px solid #e3e0da;padding-bottom:4px">${title}</h3>${body}`);
  const ul = arr => `<ul style="margin:0;padding-left:18px;line-height:1.7">${arr.join("")}</ul>`;
  const li = s => `<li>${s}</li>`;

  H.push(`<p style="margin:0 0 4px;color:#888;font-size:12px">${mon.slice(0, 4)} W${isoWeek(mon)} · ${md(mon)} – ${md(sun)}</p>`);
  H.push(`<p style="margin:0;font-size:14px">지난주 완료 <b>${lastDone}</b>개 · 이번 주 목표 <b>${week.length}</b>개 · 2주 안 마감 <b>${soon.length}</b>개</p>`);

  sec("이번 주 목표", week.length ? ul(week.map(i => li(`${i.done ? "✓ " : "☐ "}${esc(i.title)}${parentOf(i)}`))) : `<p style="color:#888">아직 이번 주 목표가 없습니다. 플래너에서 세워 보세요.</p>`);
  if (carried.length) sec("지난주에서 넘어온 일", ul(carried.map(i => li(esc(i.title)))));
  if (monthGoals.length) {
    const dn = monthGoals.filter(i => i.done).length;
    sec(`이번 달 목표 ${dn}/${monthGoals.length}`, ul(monthGoals.map(i => li(`${i.done ? "✓ " : "☐ "}${esc(i.title)}${parentOf(i)}`))));
  }
  if (soon.length) sec("다가오는 마감 (2주)", ul(soon.map(i => {
    const n = daysBetween(today, due(i));
    return li(`<b style="color:${n < 0 ? "#c0392b" : n <= 3 ? "#d9822f" : "#333"}">${dd(n)}</b> ${esc(i.title)} <span style="color:#888">· ${KIND[i.kind] || ""} · ${due(i)}</span>`);
  })));
  if (papers.length) sec("원고 현황", ul(papers.map(p => {
    const P = p.paper || {}, log = (p.stageLog || []).filter(x => x.stage === P.stage).pop();
    const dur = n => n >= 14 ? `${Math.floor(n / 7)}주` : `${n}일`;
    // 투고·리뷰는 투고일부터, 리비전은 리비전에 들어간 날부터
    const wait = ["submitted", "review"].includes(P.stage) && P.submitted ? `투고 후 ${dur(Math.max(0, daysBetween(P.submitted, today)))}`
               : ["submitted", "review", "revision"].includes(P.stage) && log ? `${STAGE[P.stage]} ${dur(Math.max(0, Math.floor((Date.now() - log.at) / 864e5)))}째` : "";
    const extra = [P.journal, wait, p.due ? dd(daysBetween(today, p.due)) : ""].filter(Boolean).join(" · ");
    return li(`<b>${STAGE[P.stage] || "작성 중"}</b> ${esc(p.title)}${extra ? ` <span style="color:#888">· ${esc(extra)}</span>` : ""}`);
  })));
  if (review && review.review) {
    const r = review.review, part = (k, l) => r[k] ? `<p style="margin:6px 0"><b>${l}</b><br>${esc(r[k]).replace(/\n/g, "<br>")}</p>` : "";
    if (r.good || r.blocked || r.next) sec("지난주 회고", part("next", "이번 주에 하기로 한 것") + part("blocked", "막혔던 것") + part("good", "잘된 것"));
  }
  H.push(`<p style="margin:26px 0 0"><a href="${PLANNER_URL}" style="color:#b4532a">플래너 열기 →</a></p>`);

  const html = `<div style="font-family:-apple-system,'Noto Sans KR',sans-serif;max-width:620px;color:#1f1d1a;font-size:14px">${H.join("")}</div>`;
  MailApp.sendEmail({
    to: TO || Session.getEffectiveUser().getEmail(),
    subject: `[Research Planner] W${isoWeek(mon)} (${md(mon)} – ${md(sun)}) 이번 주 목표`,
    htmlBody: html,
    body: html.replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n")
  });
}
