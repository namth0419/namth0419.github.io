/*
 * 계절 풍경 (플래너 상단 띠)
 *   - 계절: 1년 동안 날마다 조금씩 색이 이어서 바뀝니다 (벚꽃 → 신록 → 짙은 초록 → 단풍 → 앙상한 가지).
 *   - 절기: 태양 황경이 15°의 배수를 지나는 그날에만 절기 이름을 보여줍니다.
 *   - 해·달: 설정한 위치에서의 실제 위치(방위·고도)를 계산해 그립니다. 일출·일몰, 달의 월령도 실제와 같습니다.
 *   - 날씨: 설정한 위치의 현재 날씨(Open-Meteo, 키 없음)를 받아 구름·비·눈·안개·뇌우를 그립니다.
 *   - 켜고 끄기와 위치는 설정 창(window.PlannerScene)에서. 이 브라우저에만 저장합니다.
 *   - 그림: 동글동글한 섬 풍경 (휘어진 지평선, 강, 둥근 나무, 작은 집, 꽃). 나무와 꽃은 바람에 살랑임
 *   - 로컬 미리보기(localhost 에서만): ?date=2026-04-05&hour=10&wx=61&temp=12
 *       wx: 날씨 코드(0 맑음, 3 흐림, 45 안개, 61 비, 65 폭우, 71 눈, 75 폭설, 95 뇌우)
 * 그리는 순서: 하늘 → 별·달·해 → 구름 → 땅(산, 언덕, 나무, 집) → 안개·날씨 → 종이 질감
 */
/* ---------- 계절 포인트 색 (풍경을 꺼도 적용) ----------
 * 바탕색은 그대로 두고 --deep, --film-1~4 만 날짜에 따라 이어서 바뀝니다.
 * 겨울 얼음빛 파랑 → 새순 연두 → 벚꽃 분홍 → 신록 초록 → 여름 물빛 → 늦여름 황금 → 단풍 → 늦가을 갈색
 */
(function () {
  "use strict";
  // [날(1월 1일부터), 포인트, 보조, 셋째, 완료색]  (라이트 모드 기준)
  const ACC = [
    [20,  "#3d6a8f", "#6f8fb0", "#9aa9b8", "#5f8a7f"],
    [64,  "#6b8f3e", "#a3b85a", "#d4b85a", "#4f8f5f"],
    [98,  "#c0587a", "#e48aa5", "#e8b4a0", "#5f9a6a"],
    [135, "#3f8a4f", "#7fb35a", "#d9c25a", "#2f8a6f"],
    [201, "#1f7a8c", "#3aa6b9", "#f0a35e", "#2f9a7a"],
    [244, "#8a7a2a", "#c9a43a", "#d9774a", "#5f8a4f"],
    [293, "#b4532a", "#d9822f", "#c9a24a", "#5f7f55"],
    [318, "#8a5a3a", "#b07a4a", "#a89a7a", "#5f7a5f"],
    [345, "#4a6a8a", "#7a95b0", "#b0a8a0", "#5f8080"]
  ];
  const rgb = hx => [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16));
  const hex = c => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, k) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * k)); };
  const smooth = x => x * x * (3 - 2 * x);
  const style = document.createElement("style");
  style.id = "season-accent";
  document.head.append(style);

  function apply() {
    const d = new Date();
    let doy = (d - new Date(d.getFullYear(), 0, 1)) / 864e5;
    try { const p = JSON.parse(localStorage.getItem("planner-place")); if (p && p.lat < 0) doy = (doy + 182.5) % 365; } catch (e) {}
    let i = ACC.length - 1;
    ACC.forEach((k, j) => { if (k[0] <= doy) i = j; });
    const A = ACC[i], B = ACC[(i + 1) % ACC.length];
    const span = (B[0] - A[0] + 365) % 365 || 365, f = smooth(((doy - A[0] + 365) % 365) / span);
    const c = [1, 2, 3, 4].map(k => mix(A[k], B[k], f));
    const dark = c.map((x, k) => mix(x, "#ffffff", k === 3 ? .3 : .42));
    const vars = (cs, deep) => `--deep:${deep};--film-1:${cs[0]};--film-2:${cs[1]};--film-3:${cs[2]};--film-4:${cs[3]}`;
    style.textContent = `:root{${vars(c, c[0])}} :root[data-theme="dark"]{${vars(dark, mix(dark[0], "#ffffff", .1))}}`;
  }
  apply();
  setInterval(apply, 60 * 60e3);                  // 한 시간마다 (자정을 넘기면 바뀜)
})();

(function () {
  "use strict";
  const band = document.getElementById("season");
  if (!band) return;
  const cvs = band.querySelector("canvas");
  const ctx = cvs.getContext("2d");
  const termChip = band.querySelector(".season-label");
  const placeBtn = band.querySelector(".season-place");
  const KEY = "planner-season", PLACE_KEY = "planner-place", WX_KEY = "planner-weather";
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const DEFAULT_PLACE = { name: "대전", lat: 36.3504, lon: 127.3845 };

  /* ---------- 천문 계산: 태양·달의 방위와 고도, 달의 위상 (일반적인 저정밀 공식) ---------- */
  const J1970 = 2440588, J2000 = 2451545, OBL = RAD * 23.4397;
  const toDays = date => date.valueOf() / 864e5 - .5 + J1970 - J2000;
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
  const decl = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
  const azim = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const alti = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const sidereal = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
  const sunAnomaly = d => RAD * (357.5291 + .98560028 * d);
  const eclLon = M => M + RAD * (1.9148 * Math.sin(M) + .02 * Math.sin(2 * M) + .0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  function sunCoords(d) { const L = eclLon(sunAnomaly(d)); return { dec: decl(L, 0), ra: ra(L, 0) }; }
  function moonCoords(d) {
    const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
    const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: decl(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  function sunPos(date, lat, lon) {
    const d = toDays(date), c = sunCoords(d), H = sidereal(d, RAD * -lon) - c.ra;
    return { az: azim(H, RAD * lat, c.dec) / RAD, alt: alti(H, RAD * lat, c.dec) / RAD };
  }
  function moonPos(date, lat, lon) {
    const d = toDays(date), c = moonCoords(d), H = sidereal(d, RAD * -lon) - c.ra;
    return { az: azim(H, RAD * lat, c.dec) / RAD, alt: alti(H, RAD * lat, c.dec) / RAD };
  }
  // phase: 0 삭 → .25 상현 → .5 보름 → .75 하현,  fraction: 밝은 부분 비율
  function moonPhase(date) {
    const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
    const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: .5 + .5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
  }
  // 절기용 태양 황경: 위 식은 J2000 기준이라 세차(연 50.3")를 더하고, 2026년 춘분·하지·동지 실제 시각에 맞춰 상수 보정 (2030년까지 오차 30분 이내)
  const sunLongitude = date => {
    const d = toDays(date);
    return ((eclLon(sunAnomaly(d)) / RAD + .0139697 * d / 365.25 + .080) % 360 + 360) % 360;
  };

  /* ---------- 24절기 (태양 황경) ---------- */
  const TERMS = [
    [285, "소한", "小寒", "작은 추위"], [300, "대한", "大寒", "큰 추위"], [315, "입춘", "立春", "봄의 시작"],
    [330, "우수", "雨水", "눈이 녹아 비가 됨"], [345, "경칩", "驚蟄", "개구리가 깨어남"], [0, "춘분", "春分", "낮과 밤의 길이가 같음"],
    [15, "청명", "淸明", "하늘이 맑고 밝아짐"], [30, "곡우", "穀雨", "봄비가 곡식을 적심"], [45, "입하", "立夏", "여름의 시작"],
    [60, "소만", "小滿", "만물이 자라 가득 참"], [75, "망종", "芒種", "씨 뿌리기 좋은 때"], [90, "하지", "夏至", "낮이 가장 긺"],
    [105, "소서", "小暑", "작은 더위"], [120, "대서", "大暑", "큰 더위"], [135, "입추", "立秋", "가을의 시작"],
    [150, "처서", "處暑", "더위가 그침"], [165, "백로", "白露", "흰 이슬이 내림"], [180, "추분", "秋分", "밤이 길어지기 시작"],
    [195, "한로", "寒露", "찬 이슬이 맺힘"], [210, "상강", "霜降", "서리가 내림"], [225, "입동", "立冬", "겨울의 시작"],
    [240, "소설", "小雪", "첫눈이 내림"], [255, "대설", "大雪", "큰 눈이 내림"], [270, "동지", "冬至", "밤이 가장 긺"]
  ];
  // 오늘(설정한 위치의 날짜) 태양이 절기 황경을 지나면 그 절기
  function termOn(start) {
    const a = sunLongitude(new Date(start)), b = sunLongitude(new Date(start + 864e5));
    return TERMS.find(([L]) => a <= b ? a <= L && L < b : a <= L || L < b) || null;
  }

  /* ---------- 계절: 날짜 사이를 부드럽게 이어서 바뀌는 색 ---------- */
  // d: 1월 1일부터 센 날. leaf: 잎의 양(0 앙상 ~ 1 무성), bloom: 벚꽃, buds: 새순
  const KF = [
    { d: 20,  sky: ["#a9c1d8", "#eef2f5"], far: "#c3ccd6", mid: "#a3a69c", hill: ["#bdb39b", "#a0957c"], leaf: 0,   c1: "#6b8a4f", c2: "#8fb065", bloom: 0, buds: 0,  pine: "#4f6b6a" },
    { d: 64,  sky: ["#b4d3e8", "#f3f1e4"], far: "#c6d2cc", mid: "#a9b5a0", hill: ["#c6cf9e", "#a7b585"], leaf: .04, c1: "#9cc46a", c2: "#bfd98a", bloom: 0, buds: 1,  pine: "#5f866c" },
    { d: 98,  sky: ["#9fcdee", "#fbecef"], far: "#c9d7e4", mid: "#a5c2a8", hill: ["#bddc9c", "#8fbd77"], leaf: .5,  c1: "#a8cf7f", c2: "#cfe6a8", bloom: 1, buds: .3, pine: "#5f9070" },
    { d: 135, sky: ["#7fbdea", "#e8f4f2"], far: "#b5ccd8", mid: "#86b48e", hill: ["#9fd27c", "#6aab5e"], leaf: .9,  c1: "#5fa859", c2: "#9fd47d", bloom: 0, buds: 0,  pine: "#3f7a55" },
    { d: 201, sky: ["#58a9e4", "#dcf1f7"], far: "#a4c7d3", mid: "#6ea489", hill: ["#86c46e", "#4e9757"], leaf: 1,   c1: "#3b8550", c2: "#6db46b", bloom: 0, buds: 0,  pine: "#2c6a49" },
    { d: 244, sky: ["#77b6e1", "#f4efda"], far: "#b3c9c5", mid: "#8fae7f", hill: ["#adc46d", "#85a256"], leaf: 1,   c1: "#6a9745", c2: "#a4bd5c", bloom: 0, buds: 0,  pine: "#3e6e4c" },
    { d: 293, sky: ["#86b2d8", "#f8e2c2"], far: "#c7c4c0", mid: "#b19a75", hill: ["#d7aa60", "#b8843f"], leaf: .85, c1: "#d65f2c", c2: "#f2a83f", bloom: 0, buds: 0,  pine: "#56735a" },
    { d: 318, sky: ["#98abbf", "#f0e1cc"], far: "#c0bbb3", mid: "#a08d71", hill: ["#c2a678", "#a2865b"], leaf: .35, c1: "#a8512b", c2: "#d08a3e", bloom: 0, buds: 0,  pine: "#4f6655" },
    { d: 345, sky: ["#94a8bc", "#e8e2d7"], far: "#bab9b6", mid: "#958a7a", hill: ["#b6a88c", "#978b71"], leaf: 0,   c1: "#a8512b", c2: "#d08a3e", bloom: 0, buds: 0,  pine: "#4a5f54" }
  ];
  const smooth = x => x * x * (3 - 2 * x);
  function seasonAt(doy) {
    let i = KF.length - 1;
    KF.forEach((k, j) => { if (k.d <= doy) i = j; });
    const A = KF[i], B = KF[(i + 1) % KF.length];
    const span = (B.d - A.d + 365) % 365 || 365, f = smooth(((doy - A.d + 365) % 365) / span);
    const o = {};
    for (const k in A) {
      if (k === "d") continue;
      const a = A[k], b = B[k];
      o[k] = Array.isArray(a) ? a.map((c, j) => mix(c, b[j], f)) : typeof a === "string" ? mix(a, b, f) : a + (b - a) * f;
    }
    return o;
  }
  // 1년 중 c 일 근처에서 가장 큰 종 모양 가중치
  const bump = (doy, c, wd) => { const x = Math.abs(doy - c), dd = Math.min(x, 365 - x); return Math.exp(-((dd / wd) ** 2)); };

  /* ---------- 색 ---------- */
  const rgb = hx => [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16));
  const hex = c => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, k) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * k)); };
  const rgba = (hx, a) => { const [r, g, b] = rgb(hx); return `rgba(${r},${g},${b},${a})`; };
  const NIGHT = ["#0e1430", "#2a335e"], DUSK = ["#4d5a93", "#f6aa78"], NIGHT_TINT = "#121733";

  /* ---------- 날씨 (WMO 코드) ---------- */
  const WX_TEXT = c => c == null ? "" : c === 0 ? "맑음" : c <= 2 ? "구름 조금" : c === 3 ? "흐림" : c <= 48 ? "안개"
    : c <= 57 ? "이슬비" : c <= 67 ? (c === 65 || c === 67 ? "강한 비" : "비") : c <= 77 ? (c === 75 ? "많은 눈" : "눈")
    : c <= 82 ? "소나기" : c <= 86 ? "눈 소나기" : "뇌우";
  function weatherFx(W) {
    const r = { cloud: .2, rain: 0, snow: 0, fog: 0, storm: 0, wind: .4 };
    if (!W) return r;
    const c = W.code;
    r.cloud = (W.cloud ?? 30) / 100;
    r.wind = Math.min(2.5, (W.wind ?? 5) / 12);
    if (c === 45 || c === 48) r.fog = 1;
    if (c >= 51 && c <= 57) r.rain = .5;
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) r.rain = [61, 80].includes(c) ? 1 : [65, 67, 82].includes(c) ? 3.2 : 2;
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) r.snow = [71, 77, 85].includes(c) ? .6 : c === 73 ? 1.2 : 2;
    if (c >= 95) { r.rain = Math.max(r.rain, 2.5); r.storm = 1; }
    return r;
  }

  /* ---------- 상태 ---------- */
  let on, w = 0, h = 0, dpr = 1, raf = 0, last = 0, t = 0, painted = 0, flash = 0;
  let place = DEFAULT_PLACE, W = null, wxState = "idle", wxTimer = 0;
  let S = KF[0], doy = 0, sun = { az: 0, alt: 30 }, moon = { az: 0, alt: -10 }, mph = { fraction: .5, phase: .25 };
  let night = 0, dusk = 0, fx = weatherFx(null), overcast = 0, snowCover = 0, frost = false, temp = null;
  const skyL = document.createElement("canvas"), landL = document.createElement("canvas");
  let grain = null, parts = [], stars = [], clouds = [], yGround = () => h, chimney = null, windowAt = null, bolt = null;
  try { on = localStorage.getItem(KEY); } catch (e) {}
  on = on ? on === "on" : !matchMedia("(prefers-reduced-motion: reduce)").matches;
  try { const p = JSON.parse(localStorage.getItem(PLACE_KEY)); if (p && isFinite(p.lat) && isFinite(p.lon)) place = p; } catch (e) {}

  const q = new URLSearchParams(location.search);
  const PREVIEW = ["localhost", "127.0.0.1"].includes(location.hostname) && (q.has("date") || q.has("hour") || q.has("wx"));
  function now() {
    if (!PREVIEW) return new Date();
    // 미리보기 날짜·시각은 설정한 위치의 현지 시각으로 해석
    const off = W && W.offset != null ? W.offset : Math.round(place.lon / 15) * 60;
    const base = new Date(Date.now() + off * 60e3);
    const [y, m, d] = q.has("date") ? q.get("date").split("-").map(Number) : [base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()];
    const hr = q.has("hour") ? +q.get("hour") : base.getUTCHours();
    return new Date(Date.UTC(y, m - 1, d, hr) - off * 60e3);
  }

  let seed = 1;
  const srnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rnd = Math.random;

  /* ---------- 날씨 받아오기 ---------- */
  async function loadWeather(force) {
    if (PREVIEW && q.has("wx")) { W = { code: +q.get("wx"), temp: q.has("temp") ? +q.get("temp") : 10, cloud: +q.get("wx") >= 3 ? 90 : 20, wind: 10, offset: Math.round(place.lon / 15) * 60 }; wxState = "ok"; return; }
    const key = `${(+place.lat).toFixed(2)},${(+place.lon).toFixed(2)}`;
    if (!force) {
      try { const c = JSON.parse(localStorage.getItem(WX_KEY)); if (c && c.key === key && Date.now() - c.at < 20 * 60e3) { W = c.data; wxState = "ok"; return; } } catch (e) {}
    }
    wxState = "loading"; updateUi();
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}`
              + `&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m&timezone=auto`;
      const r = await fetch(u);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      W = { code: j.current.weather_code, temp: j.current.temperature_2m, cloud: j.current.cloud_cover,
            wind: j.current.wind_speed_10m, offset: (j.utc_offset_seconds || 0) / 60 };
      wxState = "ok";
      try { localStorage.setItem(WX_KEY, JSON.stringify({ key, at: Date.now(), data: W })); } catch (e) {}
    } catch (e) {
      wxState = "error";                           // 날씨 없이 계절만 그림
    }
  }

  /* ---------- 장면 계산 ---------- */
  function compute() {
    const n = now();
    const offset = W && W.offset != null ? W.offset : -n.getTimezoneOffset();      // 분
    const local = new Date(n.getTime() + offset * 60e3);
    const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset * 60e3;
    doy = (local - Date.UTC(local.getUTCFullYear(), 0, 1)) / 864e5;
    if (place.lat < 0) doy = (doy + 182.5) % 365;                                    // 남반구는 계절이 반대
    S = seasonAt(doy);
    sun = sunPos(n, place.lat, place.lon);
    moon = moonPos(n, place.lat, place.lon);
    mph = moonPhase(n);
    night = Math.min(1, Math.max(0, (-sun.alt - 2) / 10));                         // 해가 -2° 아래로 가면 어두워짐
    dusk = Math.max(0, 1 - Math.abs(sun.alt - 1.5) / 8) * (1 - night * .6);
    fx = weatherFx(W);
    temp = W ? W.temp : null;
    overcast = Math.min(.92, fx.cloud * .55 + (fx.rain || fx.snow ? .3 : 0) + fx.storm * .2 + fx.fog * .2);
    const winter = bump(doy, 20, 40);
    snowCover = fx.snow > 0 ? Math.min(1, .55 + fx.snow * .25) : winter * (temp != null && temp <= 0 ? .55 : temp == null ? .25 : .1);
    frost = temp != null && temp <= 2 && sun.alt < 20;
    updateUi(termOn(start));
  }

  // 방위(남쪽 0°, 서쪽 +) → 화면 x, 고도 → 화면 y.  왼쪽이 동쪽, 오른쪽이 서쪽. 지평선 아래로 가면 땅이 가려줌
  const horizonY = () => h * .52;
  function skyXY(p) {
    let az = p.az;
    if (place.lat < 0) az = az > 0 ? az - 180 : az + 180;                           // 남반구는 북쪽 하늘을 봄
    return { x: w * (.5 + az / 240), y: horizonY() - (p.alt / 62) * (horizonY() - h * .07) };
  }

  /* ---------- 그리기 도구: 동글동글한 섬 풍경 ----------
   * 땅은 아주 큰 원의 윗부분이라 가운데가 높고 양옆이 내려가서 '굴러가는 섬'처럼 보임.
   * 깊이 d(0 지평선 ~ 1 맨 앞)에 따라 놓이는 높이와 크기가 달라짐.
   */
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(.1, r), 0, TAU); g.fill(); };
  const ellipse = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, TAU); g.fill(); };
  let G = { cx: 0, cy: 0, R: 1 }, RIV = null, SH = c => c, TC = {}, objs = [], sparkles = [];
  const arcY = (x, r) => G.cy - Math.sqrt(Math.max(0, r * r - (x - G.cx) ** 2));
  const groundY = x => arcY(x, G.R);
  const depthY = (x, d) => { const top = groundY(x); return top + (h - top) * d; };
  const depthS = d => .5 + .75 * d;
  function arcBand(g, r1, r2) {                     // 두 동심원 사이의 띠 (강, 모래톱)
    g.beginPath();
    for (let x = -12; x <= w + 12; x += 4) g.lineTo(x, arcY(x, r1));
    for (let x = w + 12; x >= -12; x -= 4) g.lineTo(x, arcY(x, r2));
    g.closePath();
  }

  // 동그란 활엽수: 테두리 → 그늘 → 밝은 면 → 하이라이트. 꽃·열매·눈이 계절 따라 얹힘
  const BLOBS = [[0, -.16, .30], [-.22, -.02, .25], [.22, -.02, .25], [-.12, .1, .22], [.13, .1, .22]];
  function roundTree(g, o, sway) {
    const { x, y, s } = o;
    g.fillStyle = `rgba(28,40,30,${.16 * (1 - night * .6)})`; ellipse(g, x, y + 1, s * .32, s * .07);
    g.fillStyle = TC.trunk;
    g.beginPath(); g.moveTo(x - s * .075, y); g.quadraticCurveTo(x - s * .05, y - s * .25, x - s * .045, y - s * .5);
    g.lineTo(x + s * .045, y - s * .5); g.quadraticCurveTo(x + s * .05, y - s * .25, x + s * .075, y); g.closePath(); g.fill();
    const leaf = Math.max(S.leaf, S.bloom * .9);
    const cx = x + sway, cy = y - s * .72;
    if (leaf > .05) {
      const k = .62 + .38 * leaf;
      g.globalAlpha = Math.min(1, leaf * 1.5);
      g.fillStyle = TC.outline;
      for (const [bx, by, r] of BLOBS) circle(g, cx + bx * s * k, cy + by * s * k, r * s * k + 1.1);
      g.fillStyle = TC.leafD;
      for (const [bx, by, r] of BLOBS) circle(g, cx + bx * s * k, cy + by * s * k, r * s * k);
      g.save();
      g.beginPath(); for (const [bx, by, r] of BLOBS) { g.moveTo(cx + bx * s * k + r * s * k, cy + by * s * k); g.arc(cx + bx * s * k, cy + by * s * k, r * s * k, 0, TAU); }
      g.clip();
      g.fillStyle = TC.leaf;
      for (const [bx, by, r] of BLOBS) circle(g, cx + bx * s * k, cy + (by - .07) * s * k, r * s * k * .93);
      g.fillStyle = TC.leafL;
      circle(g, cx - s * .1 * k, cy - s * .22 * k, s * .1 * k); circle(g, cx + s * .09 * k, cy - s * .27 * k, s * .055 * k);
      g.restore();
      g.globalAlpha = 1;
      if (o.fruit) { g.fillStyle = TC.fruit; for (const [fx2, fy2] of [[-.15, .02], [.12, -.06], [.03, .12], [.2, .08]]) circle(g, cx + fx2 * s * k, cy + fy2 * s * k, s * .035 + .7); }
      if (S.bloom > .2) {
        g.fillStyle = `rgba(255,255,255,${.85 * S.bloom})`;
        seed = Math.round(x * 13) + 1;
        for (let i = 0; i < 8; i++) circle(g, cx + (srnd() - .5) * s * .6 * k, cy + (srnd() - .6) * s * .45 * k, s * .028 + .45);
      }
      if (snowCover > .3) {
        g.fillStyle = `rgba(255,255,255,${snowCover * .95})`;
        ellipse(g, cx - s * .03, cy - s * .38 * k, s * .19 * k, s * .07 * k);
        ellipse(g, cx - s * .22 * k, cy - s * .17 * k, s * .1 * k, s * .045 * k);
        ellipse(g, cx + s * .22 * k, cy - s * .17 * k, s * .1 * k, s * .045 * k);
      }
    } else {                                        // 앙상한 가지
      g.strokeStyle = TC.trunk; g.lineCap = "round"; g.lineWidth = Math.max(1, s * .045);
      const tips = [];
      for (const [d, at, len] of [[-1, .5, .26], [1, .58, .24], [-1, .72, .2], [1, .78, .16], [0, .84, .14]]) {
        const by = y - s * at, ex = x + sway * .6 + d * s * len, ey = by - s * (d ? .2 : .18);
        g.beginPath(); g.moveTo(x, by); g.quadraticCurveTo(x + d * s * len * .3, by - s * .12, ex, ey); g.stroke();
        tips.push([ex, ey]);
      }
      if (S.buds > .1) { g.fillStyle = rgba(SH("#a9d47a"), S.buds); for (const [ex, ey] of tips) circle(g, ex, ey, Math.max(1, s * .035)); }
      if (snowCover > .3) { g.fillStyle = `rgba(255,255,255,${snowCover})`; for (const [ex, ey] of tips) ellipse(g, ex, ey - 1, s * .05, s * .025); }
    }
  }
  // 층층이 둥근 침엽수
  function cedar(g, o, sway) {
    const { x, y, s } = o;
    g.fillStyle = `rgba(28,40,30,${.16 * (1 - night * .6)})`; ellipse(g, x, y + 1, s * .3, s * .065);
    g.fillStyle = TC.trunk; g.fillRect(x - s * .045, y - s * .16, s * .09, s * .16);
    for (let i = 0; i < 3; i++) {
      const cx = x + sway * (i + 1) / 3, by = y - s * (.12 + i * .24), wd = s * (.4 - i * .09), ht = s * (.36 - i * .03);
      const tier = () => {
        g.beginPath(); g.moveTo(cx - wd, by);
        g.quadraticCurveTo(cx - wd * .25, by - ht * .6, cx, by - ht);
        g.quadraticCurveTo(cx + wd * .25, by - ht * .6, cx + wd, by);
        g.quadraticCurveTo(cx, by + ht * .16, cx - wd, by); g.closePath();
      };
      g.lineWidth = 2; g.strokeStyle = TC.pineO; tier(); g.stroke();
      g.fillStyle = TC.pine; g.fill();
      g.save(); tier(); g.clip();
      g.fillStyle = TC.pineL; ellipse(g, cx - wd * .35, by - ht * .45, wd * .35, ht * .45);
      if (snowCover > .3) { g.fillStyle = `rgba(255,255,255,${snowCover * .95})`; ellipse(g, cx, by - ht * .85, wd * .45, ht * .3); }
      g.restore();
    }
  }
  // 둥근 지붕의 작은 집
  function cottage(g, o) {
    const { x, y, s } = o, bw = s * .95, bh = s * .5, rw = bw * .62, rh = s * .46;
    g.fillStyle = `rgba(28,40,30,${.16 * (1 - night * .6)})`; ellipse(g, x, y + 1.5, bw * .62, s * .08);
    g.fillStyle = TC.wall; g.strokeStyle = TC.houseO; g.lineWidth = 1.2;
    g.beginPath(); g.roundRect(x - bw / 2, y - bh, bw, bh, s * .07); g.fill(); g.stroke();
    g.fillStyle = TC.wallD; g.fillRect(x - bw / 2 + 1, y - s * .08, bw - 2, s * .07);
    // 굴뚝
    g.fillStyle = TC.chimney; g.beginPath(); g.roundRect(x + rw * .42, y - bh - rh * .78, s * .12, s * .26, 2); g.fill(); g.stroke();
    chimney = { x: x + rw * .42 + s * .06, y: y - bh - rh * .8 };
    // 지붕 (처마가 둥근 삼각형)
    const roof = () => {
      g.beginPath(); g.moveTo(x - rw - s * .08, y - bh + s * .05);
      g.quadraticCurveTo(x - rw * .45, y - bh - rh * .8, x, y - bh - rh);
      g.quadraticCurveTo(x + rw * .45, y - bh - rh * .8, x + rw + s * .08, y - bh + s * .05);
      g.quadraticCurveTo(x, y - bh - s * .04, x - rw - s * .08, y - bh + s * .05); g.closePath();
    };
    g.fillStyle = TC.roof; roof(); g.fill(); g.stroke();
    g.save(); roof(); g.clip();
    g.fillStyle = TC.roofL; ellipse(g, x - rw * .35, y - bh - rh * .55, rw * .35, rh * .3);
    if (snowCover > .3) { g.fillStyle = `rgba(255,255,255,${snowCover})`; ellipse(g, x, y - bh - rh * .78, rw * .85, rh * .3); }
    g.restore();
    // 문, 둥근 창
    g.fillStyle = TC.door;
    g.beginPath(); g.moveTo(x + bw * .08, y); g.lineTo(x + bw * .08, y - bh * .5); g.arc(x + bw * .2, y - bh * .5, bw * .12, Math.PI, 0); g.lineTo(x + bw * .32, y); g.closePath(); g.fill();
    const lit = night > .25 || (dusk > .5 && sun.alt < 3) || overcast > .75;
    g.fillStyle = lit ? "#ffd67a" : TC.glass; circle(g, x - bw * .22, y - bh * .55, s * .1);
    g.strokeStyle = TC.houseO; g.lineWidth = 1; g.beginPath(); g.arc(x - bw * .22, y - bh * .55, s * .1, 0, TAU); g.stroke();
    windowAt = lit ? { x: x - bw * .22, y: y - bh * .55, r: s * .9 } : null;
  }
  function flower(g, f, bob) {
    const { x, y, s } = f, cx = x + bob, cy = y - s;
    g.strokeStyle = TC.stem; g.lineWidth = Math.max(.8, s * .13); g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x, y - s * .5, cx, cy); g.stroke();
    g.fillStyle = f.c;
    for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; circle(g, cx + Math.cos(a) * s * .3, cy + Math.sin(a) * s * .3, s * .24); }
    g.fillStyle = TC.flowerC; circle(g, cx, cy, s * .17);
  }
  function fluffy(g, x, y, s, base, shadow) {      // 아래가 평평하고 폭신한 구름
    const bl = [[0, 0, .42], [.46, .1, .3], [-.46, .12, .28], [.18, -.2, .3], [-.2, -.16, .26]];
    g.save();
    g.beginPath(); g.rect(x - s * 2, y - s * 2, s * 4, s * 2.33); g.clip();
    g.fillStyle = shadow; for (const [bx, by, r] of bl) circle(g, x + bx * s, y + (by + .1) * s, r * s);
    g.fillStyle = base; for (const [bx, by, r] of bl) circle(g, x + bx * s, y + by * s, r * s);
    g.restore();
  }

  /* ---------- 배경: 하늘층과 땅층(땅, 강, 풀). 나무·집·꽃은 흔들리니까 매번 그림 ---------- */
  function setup(c) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); return g;
  }

  function paintBg() {
    compute();
    const grey = mix(mix("#a3abb4", "#5a6370", fx.storm * .7 + Math.min(1, fx.rain / 3) * .3), "#1d2333", night);
    const morning = sun.az < 0;
    const skyC = S.sky.map((c, i) => mix(mix(mix(c, DUSK[i], dusk * .8), NIGHT[i], night), grey, overcast * (i ? .65 : 1)));
    const shade = (c, k = .62) => mix(mix(c, grey, overcast * .25), NIGHT_TINT, night * k);
    SH = shade;

    // 하늘
    let g = setup(skyL);
    const gr = g.createLinearGradient(0, 0, 0, h * .6);
    gr.addColorStop(0, skyC[0]); gr.addColorStop(1, skyC[1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (dusk > .05 && overcast < .7) {
      const sx = Math.max(0, Math.min(w, skyXY(sun).x)) || (morning ? 0 : w);
      const rg = g.createRadialGradient(sx, horizonY(), 0, sx, horizonY(), w * .55);
      rg.addColorStop(0, rgba("#ffb980", .5 * dusk * (1 - overcast))); rg.addColorStop(1, rgba("#ffb980", 0));
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    }

    // 땅 모양
    G = { R: Math.max(w * 1.3, 900), cx: w / 2, cy: 0 };
    G.cy = h * .52 + G.R;
    g = setup(landL);
    const haze = skyC[1];
    // 지평선 너머 먼 언덕
    const farY = x => h * .5 - h * .1 * (.5 + .5 * Math.sin(x * .011 + 1.1)) - h * .05 * (.5 + .5 * Math.sin(x * .027 + 2.3));
    g.beginPath(); g.moveTo(-5, h); for (let x = -5; x <= w + 5; x += 4) g.lineTo(x, farY(x)); g.lineTo(w + 5, h); g.closePath();
    // 겨울에는 먼 언덕도 눈으로 하얗게
    g.fillStyle = shade(mix(mix(S.far, haze, .45), "#f3f6f9", Math.max(snowCover, bump(doy, 30, 55) * .6) * .8), .5); g.fill();
    // 땅
    const top = shade(mix(S.hill[0], "#f6f9fc", snowCover * .85)), bot = shade(mix(S.hill[1], "#dbe5ee", snowCover * .85));
    g.beginPath(); g.moveTo(-12, h); for (let x = -12; x <= w + 12; x += 4) g.lineTo(x, groundY(x)); g.lineTo(w + 12, h); g.closePath();
    const lg = g.createLinearGradient(0, h * .52, 0, h); lg.addColorStop(0, top); lg.addColorStop(1, bot);
    g.fillStyle = lg; g.fill();
    g.strokeStyle = mix(top, "#ffffff", .35); g.lineWidth = 1.5;
    g.beginPath(); for (let x = -12; x <= w + 12; x += 4) g.lineTo(x, groundY(x)); g.stroke();
    // 강과 모래톱
    const frozen = snowCover > .6 && temp != null && temp <= -2;
    const span = h - h * .52;
    RIV = { r1: G.R - span * .26, r2: G.R - span * .46 };
    g.fillStyle = shade(mix(S.hill[0], "#efe1bd", .7 * (1 - snowCover * .7))); arcBand(g, G.R - span * .23, G.R - span * .49); g.fill();
    const wg = g.createLinearGradient(0, h * .52 + span * .26, 0, h * .52 + span * .46);
    wg.addColorStop(0, shade(frozen ? "#e6f3f8" : "#a6e3ee", .7)); wg.addColorStop(1, shade(frozen ? "#c8e2ec" : "#5fbfd2", .7));
    g.fillStyle = wg; arcBand(g, RIV.r1, RIV.r2); g.fill();
    g.strokeStyle = rgba("#ffffff", .5 * (1 - night * .6)); g.lineWidth = 1;
    g.beginPath(); for (let x = -12; x <= w + 12; x += 4) g.lineTo(x, arcY(x, RIV.r1) + 1); g.stroke();
    RIV.frozen = frozen;
    const inRiver = (x, y) => y > arcY(x, G.R - span * .21) && y < arcY(x, G.R - span * .51);
    // 풀 무늬
    seed = 55;
    g.strokeStyle = rgba(shade(mix(S.hill[1], "#24402a", .3)), .5 * (1 - snowCover * .85)); g.lineCap = "round";
    for (let i = 0; i < w / 5; i++) {
      const x = srnd() * w, d = .03 + srnd() * .97, y = depthY(x, d), z = 1.6 + 2.6 * depthS(d);
      if (inRiver(x, y)) continue;
      g.lineWidth = .7 + .5 * d;
      g.beginPath(); g.moveTo(x - z * .5, y - z * .7); g.quadraticCurveTo(x - z * .15, y - z * .1, x, y); g.quadraticCurveTo(x + z * .15, y - z * .1, x + z * .5, y - z * .7); g.stroke();
    }
    if (frost) {
      g.fillStyle = "rgba(255,255,255,.6)";
      seed = 7;
      for (let i = 0; i < w / 4; i++) { const x = srnd() * w, y = depthY(x, srnd()); if (!inRiver(x, y)) circle(g, x, y, .7); }
    }
    yGround = x => depthY(x, .55 + Math.random() * .4);

    // 나무·집·꽃 자리와 색 (나무와 꽃은 매번 흔들리며 그림)
    const leafBase = mix(S.c1, "#f4bfcf", S.bloom), leafHi = mix(S.c2, "#fde4ec", S.bloom);
    TC = {
      trunk: shade("#8b5e3c", .55), outline: shade(mix(leafBase, "#1d2b1d", .38)), leaf: shade(leafBase),
      leafD: shade(mix(leafBase, "#1f3326", .22)), leafL: shade(mix(leafHi, "#ffffff", .22)),
      pine: shade(S.pine, .6), pineL: shade(mix(S.pine, "#ffffff", .16), .6), pineO: shade(mix(S.pine, "#0b1a10", .5), .6),
      fruit: shade(bump(doy, 290, 30) > .4 ? "#e8553a" : "#f2b33d"),
      wall: shade("#f8eedb", .6), wallD: shade("#e6d5b4", .6), roof: shade("#e2745c", .6), roofL: shade("#f0937c", .6),
      chimney: shade("#c9775f", .6), door: shade("#a06d48", .6), glass: shade("#9fc3d8", .6), houseO: shade("#7a5442", .6),
      stem: shade("#5f9b4e"), flowerC: shade("#ffe07a")
    };
    objs = [];
    seed = 101;
    const hx = w * .62, hd = .6;
    objs.push({ k: "house", x: hx, y: depthY(hx, hd), s: h * .42 * depthS(hd) });
    const nb = Math.max(4, Math.round(w / 70));
    for (let i = 0; i < nb; i++) {                  // 강 건너 뒷줄 (작게)
      const x = (i + .2 + srnd() * .6) * w / nb, d = .02 + srnd() * .06;
      objs.push({ k: srnd() < .45 ? "cedar" : "round", x, y: depthY(x, d), s: h * (.34 + srnd() * .08) * depthS(d), ph: srnd() * TAU, fruit: false });
    }
    const nf = Math.max(3, Math.round(w / 135));
    for (let i = 0; i < nf; i++) {                  // 강 이쪽 앞줄
      const x = (i + .15 + srnd() * .7) * w / nf, d = .62 + srnd() * .22;
      if (Math.abs(x - hx) < h * .45) continue;
      objs.push({ k: srnd() < .35 ? "cedar" : "round", x, y: depthY(x, d), s: h * (.42 + srnd() * .1) * depthS(d), ph: srnd() * TAU,
                  fruit: S.leaf > .8 && bump(doy, 250, 70) > .3 && srnd() < .5 });
    }
    const bloomAmt = Math.max(bump(doy, 115, 45), bump(doy, 190, 45) * .8, bump(doy, 255, 25) * .5) * (1 - snowCover);
    const FC = ["#f7a1b5", "#ffd36e", "#ffffff", "#b9a6ff", "#ff9f80"];
    for (let i = 0; i < Math.round(w / 16 * bloomAmt); i++) {
      const x = srnd() * w, d = .68 + srnd() * .3;
      if (Math.abs(x - hx) < h * .3) continue;
      objs.push({ k: "flower", x, y: depthY(x, d), s: 2.4 + 3.2 * depthS(d), ph: srnd() * TAU, c: shade(FC[(srnd() * FC.length) | 0]) });
    }
    objs.sort((a, b) => a.y - b.y);
    seed = 77;
    sparkles = RIV.frozen ? [] : Array.from({ length: Math.round(w / 40) }, () => ({ x: srnd() * w, f: .2 + srnd() * .6, ph: srnd() * TAU, len: 3 + srnd() * 5 }));

    // 별
    seed = 3;
    stars = Array.from({ length: Math.round(w / 7) }, () => ({ x: srnd() * w, y: srnd() * h * .45, r: .4 + srnd() * .9, ph: srnd() * TAU }));
    seed = 9;
    const nC = Math.round(1 + fx.cloud * 7 + (fx.rain || fx.snow ? 3 : 0));
    if (clouds.length !== nC) clouds = Array.from({ length: nC }, () =>
      ({ x: srnd() * (w + 200) - 100, y: h * (.1 + srnd() * .22), s: h * (.14 + srnd() * .1) * (1 + overcast * .5), v: .03 + srnd() * .05 }));
    painted = Date.now();
  }

  function drawMoon(x, y, r, alpha) {
    const { phase, fraction } = mph;
    ctx.save(); ctx.globalAlpha = alpha;
    if (night > .3) {                               // 달무리
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      rg.addColorStop(0, `rgba(246,241,219,${.22 * fraction})`); rg.addColorStop(1, "rgba(246,241,219,0)");
      ctx.fillStyle = rg; circle(ctx, x, y, r * 5);
    }
    ctx.fillStyle = `rgba(200,205,225,${night > .3 ? .16 : .08})`; circle(ctx, x, y, r);   // 어두운 부분
    let waxing = phase < .5;
    if (place.lat < 0) waxing = !waxing;            // 남반구는 좌우가 반대
    const k = Math.cos(phase * TAU);                // 1 삭, -1 보름
    ctx.fillStyle = "#f6f1db";
    ctx.beginPath();
    if (waxing) { ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, false); ctx.ellipse(x, y, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0); }
    else { ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, true); ctx.ellipse(x, y, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k < 0); }
    ctx.fill();
    ctx.restore();
  }

  /* ---------- 움직이는 것: 실제 날씨 + 계절 생물 ---------- */
  function spawn() {
    if (parts.length > 300) return;
    const wind = fx.wind;
    const drop = (rate, make) => { for (let r = rate; r > 0; r -= 1) if (rnd() < r) parts.push(make()); };
    const x0 = () => rnd() * (w + 120) - 60 - wind * 30;
    drop(fx.rain * 1.6, () => { const d = .5 + rnd() * .8; return { k: "rain", x: x0() + 30, y: -12, d, len: (fx.rain > 1 ? 10 : 7) * d, vy: (fx.rain > 1 ? 7 : 5) * d }; });
    drop(fx.snow * .9, () => { const d = .5 + rnd() * .8; return { k: "snow", x: x0(), y: -4, d, r: (fx.snow > 1 ? 1.1 : .8) * (1 + d), vy: .35 + d * .45, ph: rnd() * TAU }; });
    const calm = fx.rain < 1.5 && fx.snow < 1 && !fx.storm;
    if (calm) {
      drop(.35 * S.bloom * (fx.rain ? .5 : 1), () => { const d = .5 + rnd() * .8; return { k: "petal", x: x0() - 30, y: -4, d, vy: .45 + d * .35, rot: rnd() * TAU, spin: (rnd() - .5) * .12, ph: rnd() * TAU, c: rnd() < .5 ? "#f8cfdc" : "#ef9fb8" }; });
      drop(.25 * bump(doy, 300, 22), () => { const d = .5 + rnd() * .8; return { k: "leaf", x: x0(), y: -6, d, vy: .5 + d * .4, rot: rnd() * TAU, spin: (rnd() - .5) * .1, ph: rnd() * TAU, c: ["#d65f2c", "#f2a83f", "#b8451f", "#e07d34"][rnd() * 4 | 0] }; });
    }
    const count = k => parts.reduce((n, p) => n + (p.k === k), 0);
    const dry = !fx.rain && !fx.snow && !fx.storm;
    if (dry && night > .6 && rnd() < bump(doy, 178, 24) && count("fly") < 16 * bump(doy, 178, 24))
      parts.push({ k: "fly", x: rnd() * w, y: h * (.5 + rnd() * .4), vx: 0, vy: 0, ph: rnd() * TAU });
    if (dry && night < .2 && overcast < .5 && count("bfly") < Math.round(4 * bump(doy, 130, 28)))
      parts.push({ k: "bfly", x: rnd() * w, y: h * (.55 + rnd() * .25), vx: (rnd() < .5 ? -1 : 1) * .35, ph: rnd() * TAU, c: rnd() < .5 ? "#fffaf0" : "#f6d36b" });
    if (dry && night < .2 && rnd() < .02 * bump(doy, 245, 22) && count("drag") < 3)
      parts.push({ k: "drag", x: -10, y: h * (.35 + rnd() * .3), vx: 1 + rnd() * .8, ph: rnd() * TAU });
    if (dry && night < .3 && overcast < .5 && rnd() < .003)
      parts.push({ k: "bird", x: -10, y: h * (.1 + rnd() * .2), vx: .5 + rnd() * .3, ph: rnd() * TAU, n: 1 + (rnd() * 3 | 0) });
    if (dry && sun.alt > -2 && sun.alt < 25 && rnd() < .3 * bump(doy, 262, 22)) {          // 아침 이슬
      const x = rnd() * w; parts.push({ k: "dew", x, y: yGround(x) + 3 + rnd() * h * .08, life: 26 });
    }
    const cold = temp != null ? temp < 8 : bump(doy, 20, 50) > .4;
    if (chimney && cold && rnd() < .12) parts.push({ k: "smoke", x: chimney.x, y: chimney.y, r: 1.5, life: 90 });
    if (fx.storm && !bolt && rnd() < .006) {                                              // 번개
      const bx = w * (.15 + rnd() * .7), pts = [[bx, 0]];
      for (let y = 0; y < h * .6; y += h * .1) pts.push([pts[pts.length - 1][0] + (rnd() - .5) * 18, y + h * .1]);
      bolt = { pts, life: 8 }; flash = 1;
    }
  }

  function step() {
    const wind = fx.wind;
    parts = parts.filter(p => {
      switch (p.k) {
        case "snow": p.x += wind * p.d * .8 + Math.sin(t / 30 + p.ph) * .25; p.y += p.vy; return p.y < h + 4;
        case "rain": p.x += wind * p.d * 1.2; p.y += p.vy; return p.y < h + 10;
        case "petal": case "leaf":
          p.x += (.25 + wind) * p.d + Math.sin(t / 25 + p.ph) * .4; p.y += p.vy; p.rot += p.spin;
          return p.y < h + 8 && p.x < w + 20;
        case "fly":
          p.vx = Math.max(-.3, Math.min(.3, p.vx + (rnd() - .5) * .08));
          p.vy = Math.max(-.2, Math.min(.2, p.vy + (rnd() - .5) * .06));
          p.x += p.vx; p.y += p.vy;
          return night > .4 && p.x > -10 && p.x < w + 10 && p.y > h * .3 && p.y < h;
        case "bird": p.x += p.vx; p.y += Math.sin(t / 40 + p.ph) * .1; return p.x < w + 30;
        case "bfly": p.x += p.vx; p.y += Math.sin(t / 9 + p.ph) * .35; if (rnd() < .008) p.vx = -p.vx; return p.x > -10 && p.x < w + 10;
        case "drag": p.x += p.vx; p.y += Math.sin(t / 6 + p.ph) * .3; return p.x < w + 12;
        case "dew": return --p.life > 0;
        case "smoke": p.x += .12 + wind * .25; p.y -= .25; p.r += .06; return --p.life > 0;
      }
      return false;
    });
    if (bolt && --bolt.life <= 0) bolt = null;
    flash *= .8;
  }

  function drawParts() {
    for (const p of parts) {
      switch (p.k) {
        case "snow": ctx.fillStyle = `rgba(255,255,255,${.55 + p.d * .35})`; circle(ctx, p.x, p.y, p.r); break;
        case "rain":
          ctx.strokeStyle = night > .5 ? "rgba(170,190,225,.5)" : `rgba(236,242,250,${.5 + overcast * .35})`;
          ctx.lineWidth = .7 + .5 * p.d;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + fx.wind * p.len * .2, p.y + p.len); ctx.stroke(); break;
        case "petal":
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(t / 12 + p.ph)) * .7 + .3);
          ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, 2.6 * p.d + 1, 1.5 * p.d + .6, 0, 0, TAU); ctx.fill(); ctx.restore(); break;
        case "leaf": {
          const s = 3 + p.d * 2.5;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.cos(t / 14 + p.ph), 1);
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * .8, 0, 0, s); ctx.quadraticCurveTo(-s * .8, 0, 0, -s); ctx.fill();
          ctx.strokeStyle = "rgba(90,40,20,.35)"; ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
          ctx.restore(); break;
        }
        case "fly": {
          const a = .4 + .6 * Math.max(0, Math.sin(t / 10 + p.ph));
          const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7);
          rg.addColorStop(0, `rgba(255,240,150,${.55 * a})`); rg.addColorStop(1, "rgba(255,240,150,0)");
          ctx.fillStyle = rg; circle(ctx, p.x, p.y, 7);
          ctx.fillStyle = `rgba(255,252,210,${a})`; circle(ctx, p.x, p.y, 1.1); break;
        }
        case "bird":
          ctx.strokeStyle = rgba(mix("#3b4252", NIGHT_TINT, night), .75); ctx.lineWidth = 1; ctx.lineCap = "round";
          for (let i = 0; i < p.n; i++) {
            const bx = p.x - i * 9, by = p.y + i * 4, f = Math.sin(t / 5 + p.ph + i) * 2;
            ctx.beginPath(); ctx.moveTo(bx - 4, by - f); ctx.quadraticCurveTo(bx - 2, by - 2, bx, by); ctx.quadraticCurveTo(bx + 2, by - 2, bx + 4, by - f); ctx.stroke();
          }
          break;
        case "bfly": {
          const f = Math.abs(Math.sin(t / 3 + p.ph));
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.ellipse(p.x - 2 * f, p.y, 2.4 * f + .3, 1.8, -.3, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(p.x + 2 * f, p.y, 2.4 * f + .3, 1.8, .3, 0, TAU); ctx.fill();
          ctx.fillStyle = "rgba(60,50,40,.7)"; ctx.fillRect(p.x - .4, p.y - 1.5, .8, 3); break;
        }
        case "drag":
          ctx.strokeStyle = "#3f6684"; ctx.lineWidth = 1.2; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 2, p.y); ctx.stroke();
          ctx.fillStyle = `rgba(220,236,250,${.5 + .3 * Math.sin(t + p.ph)})`;
          ctx.beginPath(); ctx.ellipse(p.x - 1, p.y - 2.2, 3.5, 1.2, -.2, 0, TAU); ctx.ellipse(p.x - 1, p.y + 2.2, 3.5, 1.2, .2, 0, TAU); ctx.fill(); break;
        case "dew": {
          const a = Math.sin((26 - p.life) / 26 * Math.PI), r = 2.5 * a;
          ctx.strokeStyle = `rgba(255,255,255,${.9 * a})`; ctx.lineWidth = .7;
          ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r); ctx.stroke(); break;
        }
        case "smoke": ctx.fillStyle = `rgba(235,235,235,${Math.min(.35, p.life / 90 * .35)})`; circle(ctx, p.x, p.y, p.r); break;
      }
    }
  }

  const blit = c => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    blit(skyL);

    if (night > .25 && overcast < .7) {
      ctx.globalAlpha = Math.min(1, (night - .25) * 1.6) * (1 - overcast);
      for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${.45 + .55 * Math.max(0, Math.sin(t / 25 + s.ph))})`; circle(ctx, s.x, s.y, s.r); }
      ctx.globalAlpha = 1;
    }
    if (moon.alt > -3 && mph.fraction > .02) {
      const m = skyXY(moon);
      drawMoon(m.x, m.y, h * .07, (night > .3 ? 1 : .55) * (1 - overcast * .8));
    }
    if (sun.alt > -4) {                             // 지평선 아래로 가는 것은 땅층이 가려줌
      const p = skyXY(sun), r = h * .085, warm = sun.alt < 8;
      ctx.globalAlpha = 1 - overcast * .85;
      const rg = ctx.createRadialGradient(p.x, p.y, r * .5, p.x, p.y, r * 4.5);
      rg.addColorStop(0, warm ? "rgba(255,190,130,.55)" : "rgba(255,246,210,.6)"); rg.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = rg; circle(ctx, p.x, p.y, r * 4.5);
      ctx.fillStyle = warm ? "#ffcf9a" : "#fff6d8"; circle(ctx, p.x, p.y, r);
      ctx.globalAlpha = 1;
    }
    const cc = mix(mix(mix(mix("#ffffff", "#aeb5bf", Math.min(1, overcast * 1.1)), "#6b7380", fx.storm * .8), "#ffd9c0", dusk * .5), "#3a4366", night * .85);
    const csh = mix(cc, "#8fa6bf", .4);
    for (const c of clouds) {
      c.x += c.v * (1 + fx.wind); if (c.x - c.s * 1.2 > w) c.x = -c.s * 1.2;
      ctx.globalAlpha = .8 + overcast * .2; fluffy(ctx, c.x, c.y, c.s, cc, csh);
    }
    ctx.globalAlpha = 1;

    blit(landL);
    if (sparkles.length) {                          // 강물 반짝임
      ctx.strokeStyle = `rgba(255,255,255,${.8 - night * .45})`; ctx.lineWidth = 1; ctx.lineCap = "round";
      for (const p of sparkles) {
        const x = ((p.x + t * .25 * (1 + fx.wind * .5)) % (w + 20)) - 10;
        const y = arcY(x, RIV.r1 - (RIV.r1 - RIV.r2) * p.f);
        ctx.globalAlpha = .25 + .75 * Math.max(0, Math.sin(t / 12 + p.ph));
        ctx.beginPath(); ctx.moveTo(x - p.len / 2, y); ctx.lineTo(x + p.len / 2, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const wind = 1 + fx.wind * 1.5;                 // 뒤에 있는 것부터 그림
    for (const o of objs) {
      if (o.k === "house") cottage(ctx, o);
      else if (o.k === "flower") flower(ctx, o, Math.sin(t / 22 + o.ph) * o.s * .18 * wind);
      else { const sway = Math.sin(t / 40 + o.ph) * o.s * .018 * wind; if (o.k === "cedar") cedar(ctx, o, sway); else roundTree(ctx, o, sway); }
    }
    if (windowAt) {
      const rg = ctx.createRadialGradient(windowAt.x, windowAt.y, 0, windowAt.x, windowAt.y, windowAt.r);
      rg.addColorStop(0, `rgba(255,214,122,${.35 * Math.max(night, dusk * .6, overcast * .4)})`); rg.addColorStop(1, "rgba(255,214,122,0)");
      ctx.fillStyle = rg; circle(ctx, windowAt.x, windowAt.y, windowAt.r);
    }
    if (fx.fog) {
      const fg = ctx.createLinearGradient(0, h * .35, 0, h);
      fg.addColorStop(0, "rgba(235,238,242,0)"); fg.addColorStop(.6, `rgba(235,238,242,${.55 - night * .25})`); fg.addColorStop(1, `rgba(235,238,242,${.7 - night * .3})`);
      ctx.fillStyle = fg; ctx.fillRect(0, 0, w, h);
    }
    drawParts();
    if (bolt) {
      ctx.strokeStyle = `rgba(255,255,240,${bolt.life / 8})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); bolt.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
    if (flash > .02) { ctx.fillStyle = `rgba(255,255,255,${flash * .35})`; ctx.fillRect(0, 0, w, h); }
    if (grain) {                                    // 아주 옅은 질감
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = .025; ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = grain; ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.restore();
    }
  }

  function makeGrain() {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), im = g.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    return ctx.createPattern(c, "repeat");
  }

  /* ---------- 글자: 절기(그날만), 위치·날씨 ---------- */
  const weatherText = () => wxState === "loading" ? "날씨 불러오는 중" : wxState === "error" ? "날씨를 못 불러옴"
                          : W ? `${Math.round(W.temp)}° ${WX_TEXT(W.code)}` : "";
  const notify = () => dispatchEvent(new CustomEvent("planner:scene"));
  function updateUi(term) {
    if (term !== undefined) {
      termChip.replaceChildren();
      if (term) {
        const b = document.createElement("b"); b.textContent = "오늘은 " + term[1];
        termChip.append(b, ` ${term[2]} · ${term[3]}`);
      }
    }
    const wt = weatherText();
    placeBtn.textContent = place.name + (wt ? " · " + wt : "");
    placeBtn.title = "위치 바꾸기 (설정)";
    notify();
  }
  // 풍경 위 위치 표시를 누르면 설정 창의 위치 항목을 엶
  placeBtn.addEventListener("click", () => dispatchEvent(new CustomEvent("planner:open-settings", { detail: { section: "place" } })));

  function setPlace(p) {
    place = p;
    try { localStorage.setItem(PLACE_KEY, JSON.stringify(p)); } catch (e) {}
    W = null;
    loadWeather(true).then(refresh);
    refresh();
  }
  // 설정 창(app.js)에서 쓰는 기능
  window.PlannerScene = {
    isOn: () => on,
    setOn: v => { on = !!v; try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {} apply(); notify(); },
    place: () => ({ ...place }),
    weather: weatherText,
    setPlace,
    async search(text) {
      const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=8&language=ko&format=json`)).json();
      return (r.results || []).sort((a, b) => (b.population || 0) - (a.population || 0))
        .map(x => ({ name: x.name, detail: [x.admin2, x.admin1, x.country].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude }));
    },
    locate: () => new Promise((ok, no) => {
      if (!navigator.geolocation) return no(new Error("이 브라우저는 현재 위치를 지원하지 않습니다."));
      navigator.geolocation.getCurrentPosition(
        p => { setPlace({ name: "현재 위치", lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }); ok(); },
        () => no(new Error("현재 위치를 가져오지 못했습니다.")), { timeout: 10000 });
    })
  };

  /* ---------- 루프 ---------- */
  function refresh() { if (w) { paintBg(); draw(); } else compute(); }   // 안 보일 때도 글자는 갱신
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (ts - last < 33) return;                     // 약 30fps
    last = ts; t++;
    if (Date.now() - painted > 2 * 60e3) paintBg(); // 해·달·하늘색 갱신
    spawn(); step(); draw();
  }
  function resize() {
    const r = cvs.getBoundingClientRect();
    const nd = Math.min(2, devicePixelRatio || 1);
    const nw = Math.max(80, Math.round(r.width)), nh = Math.max(40, Math.round(r.height));
    if (nw === w && nh === h && nd === dpr) return;
    w = nw; h = nh; dpr = nd;
    cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
    if (!grain) grain = makeGrain();
    parts = []; clouds = [];
    paintBg();
    for (let i = 0; i < 120; i++) { t++; spawn(); step(); }   // 처음부터 날씨가 화면에 퍼져 있도록
    draw();
  }
  function apply() {
    band.hidden = !on;
    cancelAnimationFrame(raf); clearInterval(wxTimer);
    if (!on || document.hidden) return;
    resize();
    raf = requestAnimationFrame(frame);
    loadWeather(false).then(refresh);              // 20분 안에 받은 날씨가 있으면 그것을 씀
    wxTimer = setInterval(() => loadWeather(false).then(refresh), 20 * 60e3);
  }

  addEventListener("resize", () => { if (on) resize(); });
  document.addEventListener("visibilitychange", apply);
  updateUi(null);
  apply();
})();
