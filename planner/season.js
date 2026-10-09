/*
 * 계절 풍경 (플래너 상단 띠)
 *   - 계절: 1년 동안 날마다 조금씩 색이 이어서 바뀝니다 (벚꽃 → 신록 → 짙은 초록 → 단풍 → 앙상한 가지).
 *   - 절기: 태양 황경이 15°의 배수를 지나는 그날에만 절기 이름을 보여줍니다.
 *   - 해·달 위치, 달 모양·기울기, 절기 시각은 Meeus 의 천문 계산식으로 구함 (절기 오차 1분 안팎)
 *   - 해·달: 설정한 위치에서의 실제 위치(방위·고도)를 계산해 그립니다. 일출·일몰, 달의 월령도 실제와 같습니다.
 *   - 날씨: 설정한 위치의 현재 날씨(Open-Meteo, 키 없음)를 받아 구름·비·눈·안개·뇌우를 그립니다.
 *   - 켜고 끄기와 위치는 설정 창(window.PlannerScene)에서. 이 브라우저에만 저장합니다.
 *   - 풍경을 누르면 크게 → 한 번 더 누르면 전체 화면(라이브 배경화면: 시계·날짜·날씨). 배경 소리는 ambient.js 가 이 장면 상태로 만듦
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
  const KEY = "planner-season", PLACE_KEY = "planner-place", WX_KEY = "planner-weather3";
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const DEFAULT_PLACE = { name: "대전", lat: 36.3504, lon: 127.3845 };
  // 풍경 꾸미기 (설정 창에서 바꿈, 이 브라우저에만 저장)
  //   trees: 나무 수 배율, species: 나무 종류별 켜기, lines: 별자리 선, milky: 은하수, planet: 행성 크기 배율, speed: 하루 재생에 걸리는 초
  const OPT_KEY = "planner-scene-opts";
  const OPT = { trees: 1, species: { maple: true, ginkgo: true, cherry: true, zelkova: true, persimmon: true, cedar: true }, lines: true, milky: true, planet: 1, speed: 60 };
  try { const o = JSON.parse(localStorage.getItem(OPT_KEY)) || {}; Object.assign(OPT, o, { species: { ...OPT.species, ...(o.species || {}) } }); } catch (e) {}

  /* ---------- 천문 계산 (J. Meeus, Astronomical Algorithms 2판) ----------
   * 태양: VSOP87 요약판(부록 III)의 지구 일심 황경 + FK5·장동·광행차 보정 → 겉보기 황경 (오차 약 1″)
   * 달:   ELP2000 주요 항(47장: 경도·거리 60항, 위도 30항) + 장동 → 겉보기 위치 (오차 약 10″), 지평 시차 반영
   * 시각: 역학시 TT = UT + ΔT,  지방 항성시는 겉보기 그리니치 항성시(장동 포함)에서
   * 고도: 대기 굴절(Sæmundsson) 반영.  절기는 겉보기 황경이 15°의 배수를 지나는 순간 (오차 1분 안팎)
   * 방위는 남쪽 0°, 서쪽이 +.  달의 limb: 밝은 쪽이 향하는 방향(천정에서 동쪽으로 잰 각, 라디안)
   */
  const J2000 = 2451545, AS = RAD / 3600;
  const norm = x => ((x % 360) + 360) % 360;
  const jdUT = date => date.valueOf() / 864e5 + 2440587.5;
  function deltaT(y) {                                  // 초. 2015~2035 는 관측값 근처로 고정
    if (y >= 2015 && y <= 2035) return 69.2;
    const t = y - 2000;
    if (y >= 2005 && y <= 2050) return 62.92 + .32217 * t + .005589 * t * t;
    const u = (y - 1820) / 100; return -20 + 32 * u * u;
  }
  const jdTT = date => { const jd = jdUT(date); return jd + deltaT(2000 + (jd - J2000) / 365.25) / 86400; };

  // 지구 일심 황경 L = Σ Lk·τ^k,  Lk = Σ A·cos(B + C·τ)  (단위 1e-8 rad, τ: J2000 부터 율리우스 천년)
  const VSOP_L = [
    [175347046, 0, 0, 3341656, 4.6692568, 6283.07585, 34894, 4.6261, 12566.1517, 3497, 2.7441, 5753.3849, 3418, 2.8289, 3.5231,
     3136, 3.6277, 77713.7715, 2676, 4.4181, 7860.4194, 2343, 6.1352, 3930.2097, 1324, .7425, 11506.7698, 1273, 2.0371, 529.691,
     1199, 1.1096, 1577.3435, 990, 5.233, 5884.927, 902, 2.045, 26.298, 857, 3.508, 398.149, 780, 1.179, 5223.694,
     753, 2.533, 5507.553, 505, 4.583, 18849.228, 492, 4.205, 775.523, 357, 2.92, .067, 317, 5.849, 11790.629,
     284, 1.899, 796.298, 271, .315, 10977.079, 243, .345, 5486.778, 206, 4.806, 2544.314, 205, 1.869, 5573.143,
     202, 2.458, 6069.777, 156, .833, 213.299, 132, 3.411, 2942.463, 126, 1.083, 20.775, 115, .645, .98,
     103, .636, 4694.003, 102, .976, 15720.839, 102, 4.267, 7.114, 99, 6.21, 2146.17, 98, .68, 155.42,
     86, 5.98, 161000.69, 85, 1.3, 6275.96, 85, 3.67, 71430.7, 80, 1.81, 17260.15, 79, 3.04, 12036.46,
     75, 1.76, 5088.63, 74, 3.5, 3154.69, 74, 4.68, 801.82, 70, .83, 9437.76, 62, 3.98, 8827.39,
     61, 1.82, 7084.9, 57, 2.78, 6286.6, 56, 4.39, 14143.5, 56, 3.47, 6279.55, 52, .19, 12139.55,
     52, 1.33, 1748.02, 51, .28, 5856.48, 49, .49, 1194.45, 41, 5.37, 8429.24, 41, 2.4, 19651.05,
     39, 6.17, 10447.39, 37, 6.04, 10213.29, 37, 2.57, 1059.38, 36, 1.71, 2352.87, 36, 1.78, 6812.77,
     33, .59, 17789.85, 30, .44, 83996.85, 30, 2.74, 1349.87, 25, 3.16, 4690.48],
    [628331966747, 0, 0, 206059, 2.678235, 6283.07585, 4303, 2.6351, 12566.1517, 425, 1.59, 3.523, 119, 5.796, 26.298,
     109, 2.966, 1577.344, 93, 2.59, 18849.23, 72, 1.14, 529.69, 68, 1.87, 398.15, 67, 4.41, 5507.55,
     59, 2.89, 5223.69, 56, 2.17, 155.42, 45, .4, 796.3, 36, .47, 775.52, 29, 2.65, 7.11,
     21, 5.34, .98, 19, 1.85, 5486.78, 19, 4.97, 213.3, 17, 2.99, 6275.96, 16, .03, 2544.31,
     16, 1.43, 2146.17, 15, 1.21, 10977.08, 12, 2.83, 1748.02, 12, 3.26, 5088.63, 12, 5.27, 1194.45,
     12, 2.08, 4694, 11, .77, 553.57, 10, 1.3, 6286.6, 10, 4.24, 1349.87, 9, 2.7, 242.73,
     9, 5.64, 951.72, 8, 5.3, 2352.87, 6, 2.65, 9437.76, 6, 4.67, 4690.48],
    [52919, 0, 0, 8720, 1.0721, 6283.0758, 309, .867, 12566.152, 27, .05, 3.52, 16, 5.19, 26.3,
     16, 3.68, 155.42, 10, .76, 18849.23, 9, 2.06, 77713.77, 7, .83, 775.52, 5, 4.66, 1577.34,
     4, 1.03, 7.11, 4, 3.44, 5573.14, 3, 5.14, 796.3, 3, 6.05, 5507.55, 3, 1.19, 242.73,
     3, 6.12, 529.69, 3, .31, 398.15, 3, 2.28, 553.57, 2, 4.38, 5223.69, 2, 3.75, .98],
    [289, 5.844, 6283.076, 35, 0, 0, 17, 5.49, 12566.15, 3, 5.2, 155.42, 1, 4.72, 3.52, 1, 5.3, 18849.23, 1, 5.97, 242.73],
    [114, 3.142, 0, 8, 4.13, 6283.08, 1, 3.84, 12566.15],
    [1, 3.14, 0]
  ];
  function earthLon(tau) {
    let L = 0;
    VSOP_L.forEach((s, k) => {
      let v = 0;
      for (let i = 0; i < s.length; i += 3) v += s[i] * Math.cos(s[i + 1] + s[i + 2] * tau);
      L += v * tau ** k;
    });
    return L / 1e8;
  }

  // 장동(주요 4항)과 참 황도경사
  function nutation(T) {
    const Om = RAD * (125.04452 - 1934.136261 * T), Ls = RAD * (280.4665 + 36000.7698 * T), Lm = RAD * (218.3165 + 481267.8813 * T);
    const dpsi = (-17.2 * Math.sin(Om) - 1.32 * Math.sin(2 * Ls) - .23 * Math.sin(2 * Lm) + .21 * Math.sin(2 * Om)) * AS;
    const deps = (9.2 * Math.cos(Om) + .57 * Math.cos(2 * Ls) + .1 * Math.cos(2 * Lm) - .09 * Math.cos(2 * Om)) * AS;
    const eps0 = RAD * (23.4392911111 - .0130041667 * T - 1.6389e-7 * T * T + 5.0361e-7 * T ** 3);
    return { dpsi, eps: eps0 + deps };
  }

  // 태양의 겉보기 황경(rad)과 거리(AU)
  function sunApp(jde) {
    const T = (jde - J2000) / 36525;
    const theta = earthLon(T / 10) + Math.PI - .09033 * AS;              // 지심 황경 + FK5 보정
    const M = RAD * (357.52911 + 35999.05029 * T);
    const R = 1.000140 - .016708 * Math.cos(M) - .000139 * Math.cos(2 * M);
    const n = nutation(T);
    return { lam: theta + n.dpsi - 20.4898 / R * AS, R, n };
  }

  // 달: [D, M, M', F, Σl(1e-6°), Σr(1e-3 km)] 과 [D, M, M', F, Σb(1e-6°)]
  const MOON_LR = [
    0,0,1,0,6288774,-20905355, 2,0,-1,0,1274027,-3699111, 2,0,0,0,658314,-2955968, 0,0,2,0,213618,-569925,
    0,1,0,0,-185116,48888, 0,0,0,2,-114332,-3149, 2,0,-2,0,58793,246158, 2,-1,-1,0,57066,-152138,
    2,0,1,0,53322,-170733, 2,-1,0,0,45758,-204586, 0,1,-1,0,-40923,-129620, 1,0,0,0,-34720,108743,
    0,1,1,0,-30383,104755, 2,0,0,-2,15327,10321, 0,0,1,2,-12528,0, 0,0,1,-2,10980,79661,
    4,0,-1,0,10675,-34782, 0,0,3,0,10034,-23210, 4,0,-2,0,8548,-21636, 2,1,-1,0,-7888,24208,
    2,1,0,0,-6766,30824, 1,0,-1,0,-5163,-8379, 1,1,0,0,4987,-16675, 2,-1,1,0,4036,-12831,
    2,0,2,0,3994,-10445, 4,0,0,0,3861,-11650, 2,0,-3,0,3665,14403, 0,1,-2,0,-2689,-7003,
    2,0,-1,2,-2602,0, 2,-1,-2,0,2390,10056, 1,0,1,0,-2348,6322, 2,-2,0,0,2236,-9884,
    0,1,2,0,-2120,5751, 0,2,0,0,-2069,0, 2,-2,-1,0,2048,-4950, 2,0,1,-2,-1773,4130,
    2,0,0,2,-1595,0, 4,-1,-1,0,1215,-3958, 0,0,2,2,-1110,0, 3,0,-1,0,-892,3258,
    2,1,1,0,-810,2616, 4,-1,-2,0,759,-1897, 0,2,-1,0,-713,-2117, 2,2,-1,0,-700,2354,
    2,1,-2,0,691,0, 2,-1,0,-2,596,0, 4,0,1,0,549,-1423, 0,0,4,0,537,-1117,
    4,-1,0,0,520,-1571, 1,0,-2,0,-487,-1739, 2,1,0,-2,-399,0, 0,0,2,-2,-381,-4421,
    1,1,1,0,351,0, 3,0,-2,0,-340,0, 4,0,-3,0,330,0, 2,-1,2,0,327,0,
    0,2,1,0,-323,1165, 1,1,-1,0,299,0, 2,0,3,0,294,0, 2,0,-1,-2,0,8752
  ];
  const MOON_B = [
    0,0,0,1,5128122, 0,0,1,1,280602, 0,0,1,-1,277693, 2,0,0,-1,173237, 2,0,-1,1,55413, 2,0,-1,-1,46271,
    2,0,0,1,32573, 0,0,2,1,17198, 2,0,1,-1,9266, 0,0,2,-1,8822, 2,-1,0,-1,8216, 2,0,-2,-1,4324,
    2,0,1,1,4200, 2,1,0,-1,-3359, 2,-1,-1,1,2463, 2,-1,0,1,2211, 2,-1,-1,-1,2065, 0,1,-1,-1,-1870,
    4,0,-1,-1,1828, 0,1,0,1,-1794, 0,0,0,3,-1749, 0,1,-1,1,-1565, 1,0,0,1,-1491, 0,1,1,1,-1475,
    0,1,1,-1,-1410, 0,1,0,-1,-1344, 1,0,0,-1,-1335, 0,0,3,1,1107, 4,0,0,-1,1021, 4,0,-1,1,833
  ];
  function moonApp(jde) {
    const T = (jde - J2000) / 36525, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    const Lp = norm(218.3164477 + 481267.88123421 * T - .0015786 * T2 + T3 / 538841 - T4 / 65194000);
    const D = norm(297.8501921 + 445267.1114034 * T - .0018819 * T2 + T3 / 545868 - T4 / 113065000);
    const M = norm(357.5291092 + 35999.0502909 * T - .0001536 * T2 + T3 / 24490000);
    const Mp = norm(134.9633964 + 477198.8675055 * T + .0087414 * T2 + T3 / 69699 - T4 / 14712000);
    const F = norm(93.272095 + 483202.0175233 * T - .0036539 * T2 - T3 / 3526000 + T4 / 863310000);
    const A1 = RAD * (119.75 + 131.849 * T), A2 = RAD * (53.09 + 479264.29 * T), A3 = RAD * (313.45 + 481266.484 * T);
    const E = 1 - .002516 * T - .0000074 * T2, ecc = m => m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    let sl = 0, sr = 0, sb = 0;
    for (let i = 0; i < MOON_LR.length; i += 6) {
      const a = RAD * (MOON_LR[i] * D + MOON_LR[i + 1] * M + MOON_LR[i + 2] * Mp + MOON_LR[i + 3] * F), e = ecc(MOON_LR[i + 1]);
      sl += MOON_LR[i + 4] * e * Math.sin(a); sr += MOON_LR[i + 5] * e * Math.cos(a);
    }
    for (let i = 0; i < MOON_B.length; i += 5)
      sb += MOON_B[i + 4] * ecc(MOON_B[i + 1]) * Math.sin(RAD * (MOON_B[i] * D + MOON_B[i + 1] * M + MOON_B[i + 2] * Mp + MOON_B[i + 3] * F));
    sl += 3958 * Math.sin(A1) + 1962 * Math.sin(RAD * (Lp - F)) + 318 * Math.sin(A2);
    sb += -2235 * Math.sin(RAD * Lp) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - RAD * F) + 175 * Math.sin(A1 + RAD * F)
        + 127 * Math.sin(RAD * (Lp - Mp)) - 115 * Math.sin(RAD * (Lp + Mp));
    const n = nutation(T);
    return { lam: RAD * (Lp + sl / 1e6) + n.dpsi, beta: RAD * sb / 1e6, dist: 385000.56 + sr / 1000, n };
  }

  // 황도 → 적도,  적도 → 지평 (겉보기 항성시)
  const toEq = (lam, beta, eps) => ({
    ra: Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lam)),
    dec: Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lam))
  });
  function horizontal(date, lat, lon, eq, n) {
    const jd = jdUT(date), T = (jd - J2000) / 36525;
    const gmst = 280.46061837 + 360.98564736629 * (jd - J2000) + .000387933 * T * T - T ** 3 / 38710000;
    const phi = RAD * lat, H = RAD * (gmst + lon) + n.dpsi * Math.cos(n.eps) - eq.ra;
    return {
      az: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(eq.dec) * Math.cos(phi)) / RAD,
      alt: Math.asin(Math.sin(phi) * Math.sin(eq.dec) + Math.cos(phi) * Math.cos(eq.dec) * Math.cos(H)) / RAD,
      q: Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(eq.dec) - Math.sin(eq.dec) * Math.cos(H))   // 시차각
    };
  }
  // 대기 굴절(°): 참 고도 → 겉보기 고도. 지평선 아래로 깊어지면 서서히 0으로
  const refract = alt => alt < -2.5 ? 0 : 1.02 / Math.tan(RAD * (Math.max(alt, -1) + 10.3 / (Math.max(alt, -1) + 5.11))) / 60 * Math.min(1, (alt + 2.5) / 1.5);

  function sunPos(date, lat, lon) {
    const s = sunApp(jdTT(date)), p = horizontal(date, lat, lon, toEq(s.lam, 0, s.n.eps), s.n);
    return { az: p.az, alt: p.alt + refract(p.alt) };
  }
  function moonPos(date, lat, lon) {
    const jde = jdTT(date), m = moonApp(jde), s = sunApp(jde);
    const eq = toEq(m.lam, m.beta, m.n.eps), se = toEq(s.lam, 0, s.n.eps), p = horizontal(date, lat, lon, eq, m.n);
    let alt = p.alt - Math.asin(6378.14 / m.dist) / RAD * Math.cos(RAD * p.alt);      // 지평 시차
    alt += refract(alt);
    // 밝은 가장자리의 위치각(북극에서 동쪽으로) − 시차각 = 천정에서 동쪽으로 잰 각
    const chi = Math.atan2(Math.cos(se.dec) * Math.sin(se.ra - eq.ra),
                           Math.sin(se.dec) * Math.cos(eq.dec) - Math.cos(se.dec) * Math.sin(eq.dec) * Math.cos(se.ra - eq.ra));
    return { az: p.az, alt, limb: chi - p.q };
  }
  // phase: 0 삭 → .25 상현 → .5 보름 → .75 하현 (태양과의 황경 차),  fraction: 밝은 부분 비율
  function moonPhase(date) {
    const jde = jdTT(date), m = moonApp(jde), s = sunApp(jde), R = s.R * 149597870.7;
    const psi = Math.acos(Math.cos(m.beta) * Math.cos(m.lam - s.lam));
    const i = Math.atan2(R * Math.sin(psi), m.dist - R * Math.cos(psi));
    return { fraction: (1 + Math.cos(i)) / 2, phase: norm((m.lam - s.lam) / RAD) / 360 };
  }
  // 절기용 태양 겉보기 황경 (°)
  const sunLongitude = date => norm(sunApp(jdTT(date)).lam / RAD);

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
  const NIGHT = ["#0e1430", "#2a335e"], NIGHT_TINT = "#121733";

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

  /* ---------- 하늘 색: 대기 산란 계산 ----------
   * 보는 방향마다 대기를 따라가며 햇빛이 공기 분자(레일리)와 에어로졸·물방울(미)에 흩어지는 양을 적분하고
   * 오존 흡수를 더함 (단일 산란, Nishita 방식). 파장은 빨강 680 · 초록 550 · 파랑 440 nm.
   * - 해가 낮으면 빛이 지나는 길이 길어져 파랑이 먼저 흩어져 사라지고 → 붉은 노을
   * - 해가 진 뒤 위쪽 대기만 햇빛을 받음 → 지구 그림자와 '블루 아워'(오존이 주황을 흡수)
   * 에어로졸 양: 대기질 예보의 에어로졸 광학 두께(AOD) → 없으면 가시거리 → 없으면 습도로 추정.
   * 습도가 높으면 입자가 물을 머금어 커지므로(흡습 성장) 파장 의존성이 약해짐(옹스트롬 지수↓) → 하얗고 뿌연 하늘, 흐린 노을.
   */
  const RE = 6360e3, RA = 6420e3, HR = 8e3, HM = 1.2e3;
  const BR = [5.802e-6, 13.558e-6, 33.1e-6];               // 레일리 산란계수 (해수면, /m)
  const BO = [.65e-6, 1.881e-6, .085e-6];                  // 오존 흡수계수 (농도 최대인 25 km, /m)
  const LAMBDA = [680, 550, 440];
  const dens = hgt => [Math.exp(-hgt / HR), Math.exp(-hgt / HM), Math.max(0, 1 - Math.abs(hgt - 25e3) / 15e3)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // 방위(남쪽 0°, 서쪽 +)·고도 → 단위 벡터 (x 동, y 북, z 위)
  const dirOf = (az, alt) => { const A = az * RAD, h2 = alt * RAD; return [-Math.sin(A) * Math.cos(h2), -Math.cos(A) * Math.cos(h2), Math.sin(h2)]; };

  function aerosolOf(W) {
    const rh = W && W.rh != null ? Math.min(.97, W.rh / 100) : .6;
    let aod = W && W.aod != null ? W.aod : null, src = "AOD";
    if (aod == null && W && W.vis) { aod = (3.912 / W.vis - 1.16e-5) * HM; src = "가시거리"; }      // Koschmieder: 가시거리 → 소산계수
    if (aod == null) { aod = .12 * Math.pow((1 - rh) / .4, -.5); src = "습도"; }
    aod = Math.max(.02, Math.min(2, aod));
    const dust = W && W.dust != null ? Math.min(1, W.dust / 120) : 0;                           // 황사는 입자가 커서 파장 무관
    const alpha = Math.max(.15, 1.45 - .9 * rh - .9 * dust);                                      // 옹스트롬 지수
    const b550 = aod / HM;
    return { ext: LAMBDA.map(l => b550 * Math.pow(l / 550, -alpha)), ssa: .93 - .05 * dust, g: Math.min(.85, .68 + .14 * rh + .05 * dust), aod, alpha, src };
  }

  // 지구 중심 기준 점 p 에서 방향 d 로 대기 끝까지 (또는 땅에 막히면 null) 광학 깊이
  function lightDepth(p, d, steps) {
    const r2 = dot(p, p), b = dot(p, d);
    if (b < 0 && b * b - (r2 - RE * RE) > 0) return null;                                     // 지구에 가려짐
    const tMax = -b + Math.sqrt(Math.max(0, b * b - (r2 - RA * RA))), ds = tMax / steps, od = [0, 0, 0];
    for (let i = 0; i < steps; i++) {
      const t2 = (i + .5) * ds, q = [p[0] + d[0] * t2, p[1] + d[1] * t2, p[2] + d[2] * t2];
      const dd = dens(Math.sqrt(dot(q, q)) - RE);
      od[0] += dd[0] * ds; od[1] += dd[1] * ds; od[2] += dd[2] * ds;
    }
    return od;
  }
  const extinct = (od, A, ch) => BR[ch] * od[0] + A.ext[ch] * od[1] + BO[ch] * od[2];

  // 방향 d 로 본 하늘의 밝기 (RGB, 상대값)
  function skyRadiance(d, s, A) {
    const o = [0, 0, RE + 50], b = dot(o, d);
    const tMax = -b + Math.sqrt(b * b - (dot(o, o) - RA * RA)), N = 14, ds = tMax / N;
    const mu = dot(d, s), g = A.g;
    const pR = 3 / (16 * Math.PI) * (1 + mu * mu);
    const pM = 3 / (8 * Math.PI) * (1 - g * g) * (1 + mu * mu) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
    const od = [0, 0, 0], sR = [0, 0, 0], sM = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const t2 = (i + .5) * ds, p = [o[0] + d[0] * t2, o[1] + d[1] * t2, o[2] + d[2] * t2];
      const dd = dens(Math.sqrt(dot(p, p)) - RE);
      od[0] += dd[0] * ds; od[1] += dd[1] * ds; od[2] += dd[2] * ds;
      const ld = lightDepth(p, s, 6);
      if (!ld) continue;
      for (let ch = 0; ch < 3; ch++) {
        const att = Math.exp(-(extinct(od, A, ch) + extinct(ld, A, ch)));
        sR[ch] += dd[0] * att * ds; sM[ch] += dd[1] * att * ds;
      }
    }
    return [0, 1, 2].map(ch => sR[ch] * BR[ch] * pR + sM[ch] * A.ext[ch] * A.ssa * pM);
  }
  // 높이 hgt(m) 에서 본 햇빛의 투과율 (해 원반·구름·비행운 색)
  function sunTransmit(s, A, hgt) {
    const od = lightDepth([0, 0, RE + hgt], s, 16);
    return od ? [0, 1, 2].map(ch => Math.exp(-extinct(od, A, ch))) : [0, 0, 0];
  }
  const lum = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  const srgb = v => 255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055);
  const toHex = c => hex(c.map(srgb));
  // 빛의 색만 (밝기 1로 맞춤)
  const tint = c => { const m = Math.max(c[0], c[1], c[2]) || 1; return toHex(c.map(v => v / m)); };

  let skyMed = 1, sunTint = "#fff6d8", cloudTint = "#ffffff", cloudLit = 1, trailTint = "#ffffff", AER = aerosolOf(null);
  // 하늘 격자를 계산해서 작은 캔버스에 그린 뒤 부드럽게 늘려 붙임
  const skyGrid = document.createElement("canvas");
  function paintSky(g, grey) {
    const A = AER = aerosolOf(W), s = dirOf(sun.az, sun.alt);
    const cols = 30, rows = 12, img = new Float32Array(cols * rows * 3);
    const lums = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (i + .5) / cols * w, y = (j + .5) / rows * horizonY();
      let az = (x / w - .5) * 240;
      if (place.lat < 0) az = az > 0 ? az - 180 : az + 180;
      const alt = Math.max(.6, (horizonY() - y) / (horizonY() - h * .07) * 62);
      const L = skyRadiance(dirOf(az, alt), s, A), k = (j * cols + i) * 3;
      img[k] = L[0]; img[k + 1] = L[1]; img[k + 2] = L[2];
    }
    // 여러 번 흩어진 빛(근사): 한 번 흩어진 빛만 계산하면 해가 진 뒤 머리 위가 주황, 반대쪽 하늘은 새까맣게 나옴.
    // 실제로는 여러 번 흩어진 빛과 오존 흡수로 하늘 전체가 파랗게 채워지므로, 하늘 평균 밝기에 비례하는 푸른 빛을 고르게 더함
    // (해가 낮을수록 비중이 큼: 낮 10% → 해 진 뒤 40%)
    const mean = [0, 1, 2].map(ch => { let t = 0; for (let q = ch; q < img.length; q += 3) t += img[q]; return t / (cols * rows); });
    const msW = .1 + .3 * Math.max(0, Math.min(1, (4 - sun.alt) / 8)), BLUE = [.42, .62, 1], mL = lum(mean) * msW / lum(BLUE);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 3, lowK = 1 + .35 * j / (rows - 1);           // 지평선 쪽이 조금 더 밝음
      for (let ch = 0; ch < 3; ch++) img[k + ch] += BLUE[ch] * mL * lowK;
      lums.push(lum([img[k], img[k + 1], img[k + 2]]));
    }
    // 노출: 하늘 밝기의 중간값에 맞춤(해 주변 눈부신 곳은 하얗게 날아감).
    // 해가 지평선 아래로 내려갈수록 전체를 어둡게 (사람 눈이 적응하는 정도만큼)
    lums.sort((a, b) => a - b);
    const dark = Math.pow(Math.min(1, Math.max(.06, (sun.alt + 12) / 14)), 1.3);
    skyMed = lums[lums.length >> 1] || 1;
    const expo = .6 / skyMed;
    skyGrid.width = cols; skyGrid.height = rows;
    const gg = skyGrid.getContext("2d"), id = gg.createImageData(cols, rows);
    // 노을 보정 세기: 노을(해 고도 +6° ~ −4°)과 '블루 아워'(−2° ~ −6° 근처에서 가장 짙은 파랑)
    const clear = 1 - overcast, blueHr = Math.exp(-(((sun.alt + 3.5) / 3.5) ** 2)) * clear;
    const tw = Math.max(Math.min(1, dusk * 1.4) * (1 - night) * clear, blueHr * .85), sxf = skyXY(sun).x / w;
    const season = S.sky, nightC = NIGHT, moonSky = moon.alt > 0 ? mph.fraction * Math.min(1, moon.alt / 15) * .35 : 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 3, q = (j * cols + i) * 4;
      // 밝기만 눌러 담고(1 − e^−x) 빛깔의 비율은 그대로 둠 → 해 쪽 지평선의 주황, 머리 위의 파랑이 하얗게 바래지 않음.
      // 너무 밝아 한 채널이 넘치면 그만큼만 하얗게 (해 둘레 눈부심)
      const raw = [img[k], img[k + 1], img[k + 2]], Lr = lum(raw) * expo, Lt = 1 - Math.exp(-Lr);
      let c = raw.map(v => Lr > 0 ? v * expo * Lt / Lr : 0);
      const over = Math.max(...c);
      if (over > 1) c = c.map(v => v / over + (1 - v / over) * Math.min(1, (over - 1) * .35));
      c = c.map(v => v * dark);
      // 그림 같은 느낌: 채도 살짝 올리고, 낮에는 계절 하늘색을 살짝 섞음
      const m = lum(c); c = c.map(v => Math.max(0, m + (v - m) * (1.3 - .1 * dusk)));
      let hx = toHex(c);
      const f = j / (rows - 1);
      hx = mix(hx, mix(season[0], season[1], f), .2 * (1 - dusk) * (1 - night));          // 계절 하늘색 (동물의 숲 느낌)
      hx = mix(hx, "#ffffff", .07 * (1 - night));                                       // 살짝 파스텔
      if (tw > .01) {                                   // 노을 보정 (여러 번 흩어진 빛): 해 쪽 지평선은 넓게 주황, 머리 위는 짙은 파랑-보라
        const xf = (i + .5) / cols, alt = Math.max(.6, (1 - (j + .5) / rows) * horizonY() / (horizonY() - h * .07) * 62);
        const near = Math.exp(-((((xf - sxf) * 240) / 75) ** 2));
        hx = mix(hx, mix("#ff8a4c", "#ffc77a", .5 * near), tw * Math.exp(-alt / 11) * (.25 + .75 * near) * .75);
        hx = mix(hx, mix("#3d4c9e", "#7a6cbc", f), Math.max(tw * .5, blueHr * .85) * Math.pow(1 - f, 1.2));
      }
      hx = mix(hx, mix(nightC[0], nightC[1], f), Math.pow(night, 1.4));
      hx = mix(hx, mix("#2c3b6e", "#4a5d92", f), moonSky * night);                      // 달 밝은 밤은 하늘도 조금 밝음
      hx = mix(hx, grey, overcast * (.7 + .3 * f));
      const [r, gr, b] = rgb(hx);
      id.data[q] = r; id.data[q + 1] = gr; id.data[q + 2] = b; id.data[q + 3] = 255;
    }
    gg.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(skyGrid, 0, 0, cols, rows, 0, 0, w, horizonY() + 1);
    const hz = gg.getImageData(cols / 2 | 0, rows - 1, 1, 1).data, tp = gg.getImageData(cols / 2 | 0, 0, 1, 1).data;
    g.fillStyle = hex([hz[0], hz[1], hz[2]]); g.fillRect(0, horizonY(), w, h - horizonY());
    // 햇빛 색: 해 원반(땅 근처), 구름(3 km), 비행운(10 km)
    // 구름에 닿는 빛의 밝기는 '지금 하늘 밝기'에 견줌 (눈이 하늘 밝기에 맞춰 적응하므로, 해 진 뒤 하늘이 어두워지면 물든 구름이 도드라짐).
    // 낮에는 높은 구름에 닿는 햇빛이 하늘 밝기의 약 60배. 땅을 스쳐 오는 빛은 대기에서 1° 남짓 휘므로 그만큼 해를 올려서 계산
    const up = a => dirOf(sun.az, sun.alt + a), rel = T => Math.min(1, lum(T) / skyMed / 55);
    const T0 = sunTransmit(s, A, 50), T1 = sunTransmit(up(.5), A, 1.5e3), T3 = sunTransmit(up(.7), A, 3e3), T10 = sunTransmit(up(1.1), A, 10e3);
    lowLit = rel(T1); lowTint = lum(T1) > 0 ? tint(T1) : "#ffffff"; highLit = rel(T10);
    sunTint = lum(T0) > 0 ? tint(T0) : "#ff9a6a";
    cloudLit = rel(T3);
    cloudTint = lum(T3) > 0 ? tint(T3) : "#ffffff";
    trailTint = lum(T10) > 0 ? tint(T10) : "#ffffff";
    return [hex([tp[0], tp[1], tp[2]]), hex([hz[0], hz[1], hz[2]])];
  }

  /* ---------- 비행기와 비행운 ----------
   * 순항 고도(약 250 hPa, 10 km)의 기온·습도로 판단 (Schmidt–Appleman 기준을 단순화):
   *   -38°C 보다 따뜻하면 비행운이 생기지 않음,
   *   얼음 기준 상대습도(RHi)가 100% 이상이면 길게 퍼지며 오래 남고, 70~100% 면 조금 남고, 그보다 건조하면 금방 사라짐.
   * 기상 자료의 습도는 물 기준이라 얼음 기준으로 바꿈 (Magnus 식, 물·얼음 포화수증기압 비).
   */
  let planes = [];
  function contrailMode() {
    if (!W || W.t250 == null) return { mode: "short", life: 70 };
    const T = W.t250;
    if (T > -38) return { mode: "none", life: 0 };
    const ew = 6.112 * Math.exp(17.62 * T / (243.12 + T)), ei = 6.112 * Math.exp(22.46 * T / (272.62 + T));
    const rhi = (W.rh250 != null ? W.rh250 : 40) * ew / ei;
    return rhi >= 100 ? { mode: "persist", life: 30 * 150, rhi } : rhi >= 70 ? { mode: "medium", life: 30 * 18, rhi } : { mode: "short", life: 30 * 2.5, rhi };
  }
  function spawnPlane(force) {
    if (planes.length >= 2 || (!force && (overcast > .85 || fx.fog || fx.rain > 1 || fx.storm))) return;
    const rate = force ? 1 : 1 / (30 * 150);                                                     // 평균 2분 반에 한 대
    if (rnd() > rate) return;
    const dir = rnd() < .5 ? 1 : -1, y = h * (.1 + rnd() * .2);
    planes.push({ x: dir > 0 ? -20 : w + 20, y, dir, vy: (rnd() - .5) * .04, v: w / (30 * (55 + rnd() * 35)), s: U * .04, trail: [], c: contrailMode() });
  }
  function stepPlanes() {
    // 높은 하늘 바람(불어오는 방향 wd)에 실려 흘러감. 화면에서 동쪽은 북반구 왼쪽, 남반구 오른쪽
    const u = W && W.ws250 != null && W.wd250 != null ? -Math.sin(W.wd250 * RAD) * W.ws250 : 60;     // 동쪽 성분 km/h
    const drift = (place.lat < 0 ? 1 : -1) * u / 6000;
    planes = planes.filter(p => {
      const inSky = p.x > -30 && p.x < w + 30;
      if (inSky) {
        p.x += p.v * p.dir; p.y += p.vy;
        if (p.c.mode !== "none" && t % 2 === 0) p.trail.push({ x: p.x - p.dir * p.s * 1.1, y: p.y + p.s * .1, age: 0 });
      }
      for (const q of p.trail) { q.age++; q.x += drift; q.y += .004; }
      p.trail = p.trail.filter(q => q.age < p.c.life);
      return inSky || p.trail.length;
    });
  }
  function drawPlanes() {
    if (!planes.length) return;
    const dim = 1 - Math.min(.85, night * .9);
    const col = mix(mix("#ffffff", trailTint, Math.min(1, dusk * 1.4) * .8), "#8a93b8", night * .7);
    ctx.lineCap = "round";
    for (const p of planes) {
      const tr = p.trail, L = p.c.life;
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1], b = tr[i];
        if (b.age < 5) continue;                                                                // 엔진 바로 뒤는 아직 투명
        const k = b.age / L;
        const width = p.c.mode === "persist" ? 1 + Math.min(6, b.age / 60) : p.c.mode === "medium" ? 1 + b.age / 200 : 1;
        ctx.strokeStyle = col;
        ctx.globalAlpha = Math.max(0, (1 - k) * (p.c.mode === "persist" ? .75 : .65) * dim * (1 - overcast * .6));
        ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      if (p.x < -30 || p.x > w + 30) continue;
      // 작은 비행기: 낮에는 흰 몸체, 밤에는 깜빡이는 불빛
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.dir, 1);
      const s = p.s;
      ctx.fillStyle = night > .5 ? "#2a3150" : mix("#f4f6fa", "#9aa3b5", overcast * .5);
      ellipse(ctx, 0, 0, s * 1.3, s * .32);
      ctx.beginPath(); ctx.moveTo(-s * .15, 0); ctx.lineTo(-s * .55, s * .9); ctx.lineTo(-s * .25, s * .9); ctx.lineTo(s * .35, 0); ctx.fill();      // 날개
      ctx.beginPath(); ctx.moveTo(-s * 1.05, 0); ctx.lineTo(-s * 1.35, -s * .65); ctx.lineTo(-s * 1.1, -s * .65); ctx.lineTo(-s * .8, 0); ctx.fill(); // 꼬리
      if (night > .3) {
        const blink = t % 30 < 3;
        ctx.fillStyle = "#ff5a5a"; circle(ctx, -s * .5, s * .9, .9);
        if (blink) { ctx.fillStyle = "#ffffff"; circle(ctx, -s * 1.3, -s * .6, 1.2); }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 기념일 장식 ----------
   * 양력: 새해(12/31~1/1 밤 불꽃놀이), 어린이날(풍선), 할로윈(10/25~31 호박등·박쥐),
   *       크리스마스(12/1~26 전구·별·리스, 24~25일엔 산타 썰매)
   * 음력: 설날(연날리기·청사초롱), 부처님오신날(연등), 추석(큰 보름달·옥토끼·감)
   *   음력 날짜는 위 천문 계산으로 구함 (한국 시각 기준): 중기(우수·소만·추분)가 든 달이 1·4·8월이고,
   *   그 달의 첫날은 그 중기 직전 삭(합삭)이 있는 날.  설날 = 1월 1일, 부처님오신날 = 4월 8일, 추석 = 8월 15일
   */
  const KST = 9 * 36e5;
  const kstDay = ms => new Date(ms + KST).toISOString().slice(0, 10);
  const addDay = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const wrap180 = x => ((x + 540) % 360) - 180;
  function bisect(f, a, b) {                          // f(a)·f(b) ≤ 0 인 구간에서 0 이 되는 시각
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (f(a) * f(m) <= 0) b = m; else a = m; }
    return (a + b) / 2;
  }
  // 그 해 근처의 합삭(태양과 달의 황경이 같아지는 순간) 목록
  const newMoonCache = new Map();
  function newMoons(year) {
    if (newMoonCache.has(year)) return newMoonCache.get(year);
    const el = ms => moonPhase(new Date(ms)).phase * 360, out = [];
    let a = Date.UTC(year - 1, 10, 1), ea = el(a);
    for (let b = a + 864e5; b < Date.UTC(year + 1, 1, 1); b += 864e5) {
      const eb = el(b);
      if (eb < ea - 180) out.push(bisect(ms => wrap180(el(ms)), a, b));   // 황경 차가 360 → 0 으로 넘어감
      a = b; ea = eb;
    }
    newMoonCache.set(year, out);
    return out;
  }
  // 그 해에 태양 황경이 lon 이 되는 순간 (춘분 3/20 기준으로 대략 찾고 좁힘)
  function solarTermMs(year, lon) {
    const guess = Date.UTC(year, 2, 20) + ((lon % 360) / 360) * 365.2422 * 864e5 - (lon >= 270 ? 365.2422 * 864e5 : 0);
    return bisect(ms => wrap180(sunLongitude(new Date(ms)) - lon), guess - 12 * 864e5, guess + 12 * 864e5);
  }
  // 중기 lon 이 든 음력 달의 d 일 (양력 "YYYY-MM-DD")
  function lunarDay(year, lon, d) {
    const z = kstDay(solarTermMs(year, lon)), nm = newMoons(year).map(kstDay);
    let first = null;
    for (let i = 0; i < nm.length - 1; i++) if (nm[i] <= z && z < nm[i + 1]) first = nm[i];
    return first && addDay(first, d - 1);
  }
  const lunarCache = new Map();
  function lunarFestivals(year) {
    if (!lunarCache.has(year)) lunarCache.set(year, { seollal: lunarDay(year, 330, 1), buddha: lunarDay(year, 60, 8), chuseok: lunarDay(year, 180, 15) });
    return lunarCache.get(year);
  }
  const FEST_LABEL = { newyear: "새해 복 많이 받으세요", seollal: "설날", children: "어린이날", buddha: "부처님오신날",
                       chuseok: "추석 · 한가위", halloween: "해피 할로윈", christmas: "메리 크리스마스" };
  // 오늘(설정한 위치의 날짜) 장식할 기념일과, 이름을 보여줄 날인지
  function festivalOn(ymd) {
    if (PREVIEW && q.has("fest")) return { key: q.get("fest"), label: FEST_LABEL[q.get("fest")] || "", main: true };
    const md = ymd.slice(5), y = +ymd.slice(0, 4), L = lunarFestivals(y);
    const near = (day, before, after) => day && ymd >= addDay(day, -before) && ymd <= addDay(day, after);
    const f = (key, main) => ({ key, label: main ? FEST_LABEL[key] : "", main });
    if (md === "12-31" || md === "01-01") return f("newyear", md === "01-01");
    if (near(L.seollal, 1, 1)) return f("seollal", ymd === L.seollal);
    if (near(L.chuseok, 1, 1)) return f("chuseok", ymd === L.chuseok);
    if (near(L.buddha, 6, 0)) return f("buddha", ymd === L.buddha);
    if (md === "05-05") return f("children", true);
    if (md >= "10-25" && md <= "10-31") return f("halloween", md === "10-31");
    if (md >= "12-01" && md <= "12-26") return f("christmas", md === "12-24" || md === "12-25");
    return null;
  }
  let fest = null, fireworks = [], sleigh = null;

  /* 장식 그리기 */
  const LIGHTS = ["#ff5f5f", "#ffd23f", "#5fc8ff", "#7fe08a", "#ff9ad5"];
  function bulb(x, y, i, r) {
    const on = (Math.sin(t / 18 + i * 1.7) + 1) / 2, c = LIGHTS[i % LIGHTS.length];
    if (night > .2) { ctx.fillStyle = rgba(c, .25 * on * night); circle(ctx, x, y, r * 3.2); }
    ctx.fillStyle = mix(c, "#ffffff", .15 + .3 * on); circle(ctx, x, y, r);
  }
  function star(x, y, r, c) {
    ctx.fillStyle = c; ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  function decorateCedar(o, sway) {
    if (!fest || fest.key !== "christmas") return;
    const { x, y, s } = o;
    for (let i = 0; i < 3; i++) {                     // 층마다 전구 한 줄
      const cx = x + sway * (i + 1) / 3, by = y - s * (.12 + i * .24), wd = s * (.4 - i * .09), ht = s * (.36 - i * .03);
      for (let k = 0; k < 5; k++) { const f = (k + .5) / 5, px = cx - wd * .8 + wd * 1.6 * f; bulb(px, by - ht * (.15 + .25 * Math.sin(f * Math.PI)), k + i * 2 + (x | 0), Math.max(.9, s * .022)); }
    }
    const top = y - s * .9, r = Math.max(2.5, s * .07);
    if (night > .2) { ctx.fillStyle = `rgba(255,224,102,${.3 * night})`; circle(ctx, x + sway, top, r * 2.6); }
    star(x + sway, top, r, "#ffd94a");
  }
  function decorateRound(o, sway) {
    const la = o.leafAmt != null ? o.leafAmt : Math.max(S.leaf, S.bloom * .9);
    if (!fest || fest.key !== "christmas" || la < .05) return;
    const { x, y, s } = o, k = .62 + .38 * la, cx = x + sway, cy = y - s * .72;
    for (let i = 0; i < 6; i++) { const a = Math.PI * (.15 + .7 * i / 5); bulb(cx - Math.cos(a) * s * .34 * k, cy + Math.sin(a) * s * .12 * k - s * .05, i + (x | 0), Math.max(.8, s * .02)); }
  }
  function pumpkin(x, y, r, face) {
    ctx.fillStyle = "#e8761f";
    ellipse(ctx, x - r * .45, y - r * .55, r * .55, r * .55); ellipse(ctx, x + r * .45, y - r * .55, r * .55, r * .55);
    ctx.fillStyle = "#f28c28"; ellipse(ctx, x, y - r * .6, r * .6, r * .62);
    ctx.fillStyle = "#4d7a2e"; ctx.fillRect(x - r * .08, y - r * 1.35, r * .16, r * .3);
    if (!face) return;
    const glow = night > .25 ? 1 : .55;
    if (night > .25) { const g2 = ctx.createRadialGradient(x, y - r * .6, 0, x, y - r * .6, r * 3); g2.addColorStop(0, "rgba(255,190,80,.35)"); g2.addColorStop(1, "rgba(255,190,80,0)"); ctx.fillStyle = g2; circle(ctx, x, y - r * .6, r * 3); }
    ctx.fillStyle = `rgba(255,${night > .25 ? 214 : 120},${night > .25 ? 90 : 40},${glow})`;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + d * r * .38, y - r * .95); ctx.lineTo(x + d * r * .18, y - r * .65); ctx.lineTo(x + d * r * .55, y - r * .65); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(x - r * .45, y - r * .45); ctx.quadraticCurveTo(x, y - r * .05, x + r * .45, y - r * .45); ctx.quadraticCurveTo(x, y - r * .25, x - r * .45, y - r * .45); ctx.fill();
  }
  function decorateHouse(o) {
    if (!fest) return;
    const { x, y, s } = o, bw = s * .95, bh = s * .5, rw = bw * .62;
    if (fest.key === "christmas") {
      for (let i = 0; i <= 10; i++) {                 // 처마를 따라 전구
        const f = i / 10, ex = x - rw - s * .08 + (rw * 2 + s * .16) * f;
        bulb(ex, y - bh + s * .05 - Math.sin(f * Math.PI) * s * .06 + s * .02, i, Math.max(.9, s * .025));
      }
      const dx = x + bw * .2, dy = y - bh * .5;       // 문에 리스
      ctx.strokeStyle = "#3f8a4a"; ctx.lineWidth = Math.max(1.4, s * .035);
      ctx.beginPath(); ctx.arc(dx, dy, s * .055, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#e0453a"; circle(ctx, dx, dy + s * .055, s * .02 + .5);
    }
    if (fest.key === "halloween") {
      const r = Math.max(3, s * .11);
      pumpkin(x - bw * .62, y + 1, r, true); pumpkin(x + bw * .58, y + 1, r * .8, true); pumpkin(x - bw * .4, y + 2, r * .6, false);
    }
    if (fest.key === "seollal" && night > .25) {      // 처마 끝 청사초롱
      for (const d of [-1, 1]) {
        const lx = x + d * (rw + s * .02), ly = y - bh + s * .14;
        ctx.strokeStyle = TC.houseO; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, ly - s * .1); ctx.lineTo(lx, ly - s * .04); ctx.stroke();
        ctx.fillStyle = "rgba(255,120,90,.25)"; circle(ctx, lx, ly, s * .14);
        ctx.fillStyle = "#3d5fb8"; ctx.fillRect(lx - s * .035, ly - s * .045, s * .07, s * .03);
        ctx.fillStyle = "#e5483b"; ctx.fillRect(lx - s * .035, ly - s * .015, s * .07, s * .05);
      }
    }
  }
  // 하늘·앞쪽에 그리는 것
  function drawFestSky() {
    if (!fest) return;
    const k = fest.key;
    if (k === "newyear" && night > .4) {             // 불꽃놀이
      if ((rnd() < .035 || !fireworks.length) && fireworks.length < 6)
        fireworks.push({ x: w * (.15 + rnd() * .7), y: h * (.12 + rnd() * .2), age: 0, c: LIGHTS[rnd() * LIGHTS.length | 0], n: 18 + (rnd() * 10 | 0), v: 1 + rnd() * .6 }),
          amb("pop", (fireworks[fireworks.length - 1].x / w) * 1.6 - .8);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      fireworks = fireworks.filter(f => {
        f.age++;
        const life = 55, a = 1 - f.age / life;
        for (let i = 0; i < f.n; i++) {
          const ang = i / f.n * TAU, d = f.v * (.65 + .35 * ((i * 7) % 5) / 4) * f.age * .55 * (1 - f.age / (life * 2.2));
          const px = f.x + Math.cos(ang) * d * U * .03, py = f.y + Math.sin(ang) * d * U * .03 + f.age * f.age * .002 * U * .03;
          ctx.fillStyle = rgba(f.c, Math.max(0, a) * .35); circle(ctx, px, py, 2.6);          // 번짐
          ctx.fillStyle = rgba(mix(f.c, "#ffffff", .4), Math.max(0, a)); circle(ctx, px, py, 1.3);
        }
        return f.age < life;
      });
      ctx.restore();
    }
    if (k === "seollal" && night < .5) {             // 방패연 두 개
      for (const [fx2, fy2, c, i] of [[.24, .18, "#e5483b", 0], [.72, .12, "#3d5fb8", 1]]) {
        const x = w * fx2 + Math.sin(t / 45 + i * 2) * 6, y = h * fy2 + Math.sin(t / 33 + i) * 3, s = U * .07, tilt = Math.sin(t / 50 + i) * .12;
        ctx.strokeStyle = "rgba(90,90,90,.5)"; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(x, y + s * .5); ctx.quadraticCurveTo(x + (fx2 < .5 ? 30 : -30), y + h * .3, x + (fx2 < .5 ? 60 : -60), h * .62); ctx.stroke();
        ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
        ctx.fillStyle = "#fbf6ea"; ctx.fillRect(-s * .4, -s * .5, s * .8, s);
        ctx.fillStyle = c; ctx.fillRect(-s * .4, -s * .5, s * .8, s * .18);
        ctx.fillStyle = mix(c, "#ffffff", .2); circle(ctx, 0, s * .05, s * .17);
        ctx.restore();
      }
    }
    if (k === "children" && night < .6) {            // 풍선
      ["#ff6b6b", "#ffd93d", "#6bcBff", "#8be08a", "#c79bff"].forEach((c, i) => {
        const y = h - ((t * .35 + i * 31) % (h + 40)), x = w * (.12 + i * .19) + Math.sin(t / 28 + i) * 8, r = U * .045;
        ctx.strokeStyle = "rgba(80,80,80,.45)"; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(x, y + r * 1.2); ctx.quadraticCurveTo(x - 3, y + r * 2.2, x + 1, y + r * 3.2); ctx.stroke();
        ctx.fillStyle = c; ellipse(ctx, x, y, r * .85, r);
        ctx.fillStyle = "rgba(255,255,255,.5)"; ellipse(ctx, x - r * .3, y - r * .35, r * .18, r * .25);
      });
    }
    if (k === "halloween" && (night > .2 || dusk > .3)) {   // 박쥐 (밤하늘에서도 보이게 보랏빛 테두리)
      for (let i = 0; i < 4; i++) {
        const x = ((t * (.7 + i * .12) + i * 173) % (w + 60)) - 30, y = h * (.14 + .08 * i % .3) + Math.sin(t / 20 + i * 3) * U * .04;
        const s = U * .036, flap = Math.sin(t / 3 + i) * .6;
        const bat = () => {
          ctx.beginPath(); ctx.ellipse(x, y, s * .25, s * .35, 0, 0, TAU);
          for (const d of [-1, 1]) {
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + d * s * .7, y - s * (.6 + flap), x + d * s * 1.3, y - s * flap * .4);
            ctx.quadraticCurveTo(x + d * s * .8, y + s * .1, x, y + s * .15);
          }
        };
        ctx.strokeStyle = `rgba(190,150,255,${.35 + .3 * night})`; ctx.lineWidth = 1.6; bat(); ctx.stroke();
        ctx.fillStyle = night > .4 ? "#0c0814" : "#2d2238"; bat(); ctx.fill();
      }
    }
    if (k === "christmas" && (fest.main || PREVIEW)) { // 24~25일: 산타 썰매가 가끔 지나감
      if (!sleigh && (rnd() < 1 / (30 * 35) || (PREVIEW && q.has("sleigh")))) { sleigh = { x: -40, y: h * (.1 + rnd() * .12), v: w / (30 * 16) }; amb("bells", 16); }
      if (sleigh) {
        sleigh.x += sleigh.v;
        const { x, y } = sleigh, s = U * .05, bob = Math.sin(t / 6) * 1.5;
        ctx.fillStyle = "rgba(255,240,170,.8)";
        for (let i = 1; i < 8; i++) circle(ctx, x - s * (1.2 + i * .9), y + Math.sin(t / 8 + i) * 2, Math.max(.4, 1.2 - i * .13));   // 반짝이 꼬리
        ctx.fillStyle = night > .4 ? "#2a2238" : "#6b4a2f";                                                            // 순록 두 마리
        for (const j of [0, 1]) { const rx = x + s * (1.6 + j * 1.3), ry = y - s * .3 + bob * (j ? -1 : 1);
          ellipse(ctx, rx, ry, s * .4, s * .18); circle(ctx, rx + s * .4, ry - s * .2, s * .13);
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx + s * .42, ry - s * .3); ctx.lineTo(rx + s * .5, ry - s * .5); ctx.stroke(); }
        ctx.fillStyle = "#ff5a4a"; circle(ctx, x + s * 3.05, y - s * .5 + bob, s * .07 + .6);                         // 루돌프 코
        ctx.strokeStyle = "rgba(200,170,120,.8)"; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(x + s * .5, y - s * .1); ctx.lineTo(x + s * 1.3, y - s * .3); ctx.stroke();
        ctx.fillStyle = "#d63a32"; ctx.beginPath(); ctx.roundRect(x - s * .6, y - s * .25, s * 1.1, s * .45, s * .15); ctx.fill();          // 썰매
        ctx.fillStyle = "#e9c46a"; ctx.fillRect(x - s * .65, y + s * .22, s * 1.25, s * .06);
        ctx.fillStyle = "#d63a32"; circle(ctx, x - s * .15, y - s * .4, s * .18); ctx.fillStyle = "#f6e6d0"; circle(ctx, x - s * .02, y - s * .5, s * .1);  // 산타
        ctx.fillStyle = "#ffffff"; circle(ctx, x - s * .25, y - s * .58, s * .07);
        if (sleigh.x > w + 60) sleigh = null;
      }
    }
  }
  // 앞쪽(땅 위) 장식: 부처님오신날 연등 줄
  function drawFestFront() {
    if (!fest || fest.key !== "buddha") return;
    const y0 = h * .16, sag = h * .06, n = 9, cols = ["#ff8fb1", "#ffd166", "#7fd1a8", "#ff6b6b", "#b39bff"];
    ctx.strokeStyle = "rgba(90,70,60,.55)"; ctx.lineWidth = .8;
    ctx.beginPath(); for (let x = -5; x <= w + 5; x += 8) ctx.lineTo(x, y0 + Math.sin(x / w * Math.PI) * sag); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const x = w * (i + .5) / n, y = y0 + Math.sin(x / w * Math.PI) * sag + U * .045, r = U * .035, c = cols[i % cols.length];
      if (night > .2) { const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 3); g2.addColorStop(0, rgba(c, .4 * night)); g2.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g2; circle(ctx, x, y, r * 3); }
      ctx.beginPath(); ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x, y - U * .045); ctx.stroke();
      ctx.fillStyle = mix(c, "#ffffff", night > .2 ? .25 : 0);
      for (let k = 0; k < 5; k++) { const a = Math.PI * (.15 + .7 * k / 4); ellipse(ctx, x - Math.cos(a) * r * .55, y - Math.sin(a) * r * .5 + r * .2, r * .32, r * .55); }
      ctx.fillStyle = "#f4e3b5"; ctx.fillRect(x - r * .5, y + r * .55, r, r * .25);
      ctx.strokeStyle = rgba(c, .7); ctx.beginPath(); ctx.moveTo(x, y + r * .8); ctx.lineTo(x, y + r * 1.4); ctx.stroke();
      ctx.strokeStyle = "rgba(90,70,60,.55)";
    }
  }
  // 추석: 옥토끼 (보름달 위 그림자)
  function moonRabbit(x, y, r) {
    if (!fest || fest.key !== "chuseok" || mph.fraction < .85) return;
    ctx.save(); ctx.fillStyle = "rgba(170,160,135,.45)";
    ellipse(ctx, x - r * .1, y + r * .15, r * .28, r * .22); circle(ctx, x + r * .2, y - r * .05, r * .14);
    ellipse(ctx, x + r * .22, y - r * .35, r * .05, r * .2); ellipse(ctx, x + r * .32, y - r * .32, r * .05, r * .18);
    ctx.fillRect(x - r * .5, y + r * .2, r * .12, r * .3); ctx.restore();
  }

  /* ---------- 음력 날짜 (플래너 달력에서 씀) ----------
   * 한국 시각 기준. 합삭이 있는 날이 그 달 1일이고, 중기(태양 황경 30°의 배수)가 든 달이 그 번호의 달
   * (우수 330° → 1월, 춘분 0° → 2월 … 동지 270° → 11월), 중기가 없는 달은 앞 달의 윤달.
   */
  const zqCache = new Map();
  function zhongqiDays(year) {                       // 그 해(전년 12월 동지 ~ 그 해 11월) 중기 12개
    if (!zqCache.has(year)) zqCache.set(year, Array.from({ length: 12 }, (_, i) => { const lon = i * 30; return { lon, day: kstDay(solarTermMs(year, lon)) }; }));
    return zqCache.get(year);
  }
  const lunarDateCache = new Map();
  function lunarDate(ymd) {
    if (lunarDateCache.has(ymd)) return lunarDateCache.get(ymd);
    const y = +ymd.slice(0, 4);
    const nm = [...new Set([y - 1, y, y + 1].flatMap(newMoons).map(kstDay))].sort();
    const zq = [y - 1, y, y + 1, y + 2].flatMap(zhongqiDays);
    const monthOf = i => {
      const z = zq.find(q => nm[i] <= q.day && q.day < nm[i + 1]);
      if (z) return { m: (Math.round(z.lon / 30) + 1) % 12 + 1, leap: false };
      return i > 0 ? { m: monthOf(i - 1).m, leap: true } : null;
    };
    let i = nm.length - 2;
    while (i > 0 && nm[i] > ymd) i--;
    const mo = monthOf(i);
    const r = mo && { m: mo.m, d: Math.round((Date.parse(ymd) - Date.parse(nm[i])) / 864e5) + 1, leap: mo.leap };
    lunarDateCache.set(ymd, r);
    return r;
  }
  window.PlannerLunar = lunarDate;

  /* ---------- 별자리와 은하수 ----------
   * 밝은 별의 실제 좌표(J2000 적경 h, 적위 °, 등급, 색)로 그 시각·위치의 하늘에 놓음.
   * 풍경 띠는 가로로 길어서 세로가 약 3.5배 눌려 있으므로, 별자리 위치(중심)는 실제대로 두고
   * 모양은 그 자리에서 원래 비율로 그림. 은하수는 은하 적도(b = 0)를 적도 좌표로 바꿔 띠로 그리고
   * 은하 중심(궁수자리) 쪽일수록 밝게. 해가 충분히 지고, 달이 밝지 않고, 맑을 때만 보임.
   */
  const SC = { b: "#cfe0ff", w: "#f4f6ff", y: "#fff1c9", o: "#ffd2a0", r: "#ffad8a" };
  const CONST = [
    ["오리온", { Betelgeuse: [5.919, 7.407, .5, "r"], Bellatrix: [5.419, 6.35, 1.6, "b"], Meissa: [5.585, 9.934, 3.4, "b"], Mintaka: [5.533, -.299, 2.2, "b"],
      Alnilam: [5.604, -1.202, 1.7, "b"], Alnitak: [5.679, -1.943, 1.8, "b"], Saiph: [5.796, -9.67, 2.1, "b"], Rigel: [5.242, -8.202, .1, "b"] },
      "Betelgeuse-Meissa Meissa-Bellatrix Betelgeuse-Alnitak Bellatrix-Mintaka Mintaka-Alnilam Alnilam-Alnitak Alnitak-Saiph Mintaka-Rigel"],
    ["큰개", { Sirius: [6.752, -16.716, -1.46, "w"], Mirzam: [6.378, -17.956, 2, "b"], Wezen: [7.14, -26.393, 1.8, "y"], Adhara: [6.977, -28.972, 1.5, "b"], Aludra: [7.401, -29.303, 2.4, "b"] },
      "Mirzam-Sirius Sirius-Wezen Wezen-Adhara Wezen-Aludra"],
    ["작은개", { Procyon: [7.655, 5.225, .34, "y"], Gomeisa: [7.453, 8.289, 2.9, "b"] }, "Procyon-Gomeisa"],
    ["쌍둥이", { Castor: [7.577, 31.888, 1.6, "w"], Pollux: [7.755, 28.026, 1.1, "o"], Wasat: [7.335, 21.982, 3.5, "w"], Alhena: [6.629, 16.399, 1.9, "w"],
      Mebsuta: [6.732, 25.131, 3, "y"], Tejat: [6.383, 22.514, 2.9, "r"] }, "Castor-Pollux Pollux-Wasat Wasat-Alhena Castor-Mebsuta Mebsuta-Tejat"],
    ["황소", { Aldebaran: [4.599, 16.509, .85, "o"], Elnath: [5.438, 28.608, 1.65, "b"], Tianguan: [5.627, 21.143, 3, "b"], HyG: [4.33, 15.628, 3.6, "y"],
      HyD: [4.382, 17.543, 3.8, "y"], HyE: [4.477, 19.18, 3.5, "y"], Alcyone: [3.791, 24.105, 2.9, "b"], Atlas: [3.819, 24.053, 3.6, "b"],
      Electra: [3.748, 24.113, 3.7, "b"], Maia: [3.763, 24.368, 3.9, "b"], Merope: [3.772, 23.948, 4.2, "b"], Taygeta: [3.754, 24.467, 4.3, "b"] },
      "HyG-HyD HyD-HyE HyE-Elnath HyG-Aldebaran Aldebaran-Tianguan"],
    ["마차부", { Capella: [5.278, 45.998, .08, "y"], Menkalinan: [5.992, 44.947, 1.9, "w"], AurTheta: [5.995, 37.213, 2.6, "w"], Hassaleh: [4.95, 33.166, 2.7, "o"], AurEps: [5.033, 43.823, 3, "y"] },
      "Capella-Menkalinan Menkalinan-AurTheta Hassaleh-AurEps AurEps-Capella"],
    ["사자", { Regulus: [10.139, 11.967, 1.35, "b"], LeoEta: [10.122, 16.763, 3.5, "w"], Algieba: [10.333, 19.842, 2, "o"], Adhafera: [10.278, 23.417, 3.4, "w"],
      RasElased: [9.764, 23.774, 3, "y"], Zosma: [11.235, 20.524, 2.6, "w"], Chertan: [11.237, 15.43, 3.3, "w"], Denebola: [11.818, 14.572, 2.1, "w"] },
      "Regulus-LeoEta LeoEta-Algieba Algieba-Adhafera Adhafera-RasElased Algieba-Zosma Zosma-Denebola Denebola-Chertan Chertan-Regulus Zosma-Chertan"],
    ["처녀", { Spica: [13.42, -11.161, .97, "b"], Porrima: [12.694, -1.449, 2.7, "w"], VirDelta: [12.927, 3.397, 3.4, "r"], Vindemiatrix: [13.036, 10.959, 2.8, "y"],
      Zavijava: [11.845, 1.765, 3.6, "y"], VirZeta: [13.578, -.596, 3.4, "w"] },
      "Spica-Porrima Porrima-VirDelta VirDelta-Vindemiatrix Porrima-Zavijava Spica-VirZeta VirZeta-VirDelta"],
    ["까마귀", { Gienah: [12.263, -17.542, 2.6, "b"], Algorab: [12.498, -16.515, 2.9, "b"], Kraz: [12.573, -23.397, 2.6, "y"], CrvEps: [12.169, -22.62, 3, "o"] },
      "Gienah-Algorab Algorab-Kraz Kraz-CrvEps CrvEps-Gienah"],
    ["목동", { Arcturus: [14.261, 19.182, -.05, "o"], Izar: [14.75, 27.074, 2.4, "o"], BooDelta: [15.258, 33.315, 3.5, "y"], Nekkar: [15.032, 40.39, 3.5, "y"],
      Seginus: [14.535, 38.308, 3, "w"], BooRho: [14.53, 30.371, 3.6, "o"], Muphrid: [13.911, 18.398, 2.7, "y"] },
      "Arcturus-Izar Izar-BooDelta BooDelta-Nekkar Nekkar-Seginus Seginus-BooRho BooRho-Arcturus Arcturus-Muphrid"],
    ["전갈", { Antares: [16.49, -26.432, 1, "r"], Graffias: [16.091, -19.806, 2.6, "b"], Dschubba: [16.006, -22.622, 2.3, "b"], ScoPi: [15.981, -26.114, 2.9, "b"],
      ScoSigma: [16.353, -25.593, 2.9, "b"], ScoTau: [16.598, -28.216, 2.8, "b"], ScoEps: [16.836, -34.293, 2.3, "o"], ScoMu: [16.864, -38.048, 3, "b"],
      ScoZeta: [16.91, -42.362, 3.6, "o"], ScoEta: [17.203, -43.239, 3.3, "w"], Sargas: [17.622, -42.998, 1.9, "y"], ScoIota: [17.793, -40.127, 3, "y"],
      ScoKappa: [17.708, -39.03, 2.4, "b"], Shaula: [17.56, -37.104, 1.6, "b"], Lesath: [17.513, -37.296, 2.7, "b"] },
      "Graffias-Dschubba Dschubba-ScoPi Dschubba-ScoSigma ScoSigma-Antares Antares-ScoTau ScoTau-ScoEps ScoEps-ScoMu ScoMu-ScoZeta ScoZeta-ScoEta ScoEta-Sargas Sargas-ScoIota ScoIota-ScoKappa ScoKappa-Shaula Shaula-Lesath"],
    ["궁수", { Alnasl: [18.097, -30.424, 3, "o"], KausMedia: [18.35, -29.828, 2.7, "o"], KausAustralis: [18.403, -34.385, 1.8, "b"], KausBorealis: [18.466, -25.422, 2.8, "o"],
      SgrPhi: [18.761, -26.991, 3.2, "b"], Nunki: [18.921, -26.297, 2, "b"], SgrTau: [19.116, -27.671, 3.3, "o"], Ascella: [19.044, -29.88, 2.6, "w"] },
      "Alnasl-KausMedia KausMedia-KausAustralis KausAustralis-Alnasl KausMedia-KausBorealis KausBorealis-SgrPhi SgrPhi-KausMedia SgrPhi-Nunki Nunki-SgrTau SgrTau-Ascella Ascella-SgrPhi Ascella-KausAustralis"],
    ["거문고", { Vega: [18.616, 38.784, .03, "b"], LyrZeta: [18.746, 37.605, 4.3, "w"], LyrDelta: [18.908, 36.899, 4.3, "r"], Sulafat: [18.982, 32.69, 3.3, "b"], Sheliak: [18.835, 33.363, 3.5, "b"] },
      "Vega-LyrZeta LyrZeta-LyrDelta LyrDelta-Sulafat Sulafat-Sheliak Sheliak-LyrZeta"],
    ["백조", { Deneb: [20.69, 45.28, 1.25, "w"], Sadr: [20.37, 40.257, 2.2, "y"], CygEta: [19.938, 35.083, 3.9, "o"], Albireo: [19.512, 27.96, 3.1, "o"], CygDelta: [19.75, 45.131, 2.9, "b"], Gienah2: [20.77, 33.97, 2.5, "o"] },
      "Deneb-Sadr Sadr-CygEta CygEta-Albireo CygDelta-Sadr Sadr-Gienah2"],
    ["독수리", { Altair: [19.846, 8.868, .76, "w"], Tarazed: [19.771, 10.613, 2.7, "o"], Alshain: [19.922, 6.407, 3.7, "y"], AqlDelta: [19.425, 3.115, 3.4, "w"],
      AqlLambda: [19.104, -4.883, 3.4, "b"], AqlZeta: [19.09, 13.863, 3, "w"], AqlTheta: [20.188, -.821, 3.2, "b"] },
      "Tarazed-Altair Altair-Alshain Altair-AqlDelta AqlDelta-AqlLambda AqlDelta-AqlZeta Alshain-AqlTheta"],
    ["페가수스", { Markab: [23.079, 15.205, 2.5, "b"], Scheat: [23.063, 28.083, 2.4, "r"], Algenib: [.22, 15.184, 2.8, "b"], Alpheratz: [.14, 29.091, 2.1, "b"],
      PegZeta: [22.691, 10.831, 3.4, "b"], PegTheta: [22.17, 6.198, 3.5, "w"], Enif: [21.736, 9.875, 2.4, "o"] },
      "Markab-Scheat Scheat-Alpheratz Alpheratz-Algenib Algenib-Markab Markab-PegZeta PegZeta-PegTheta PegTheta-Enif"],
    ["남쪽물고기", { Fomalhaut: [22.961, -29.622, 1.16, "w"] }, ""],
    ["바다뱀", { Alphard: [9.46, -8.659, 2, "o"] }, ""]
  ].map(([name, stars, lines]) => ({ name, stars: Object.entries(stars).map(([id, [ra, dec, mag, c]]) => ({ id, ra: ra * 15 * RAD, dec: dec * RAD, mag, c })),
                                     lines: lines ? lines.split(" ").map(p => p.split("-")) : [] }));
  let skyStars = [];
  function computeSkyObjects(date) {
    const n = nutation((jdTT(date) - J2000) / 36525), lat = place.lat, lon = place.lon;
    skyStars = CONST.map(c => {
      const st = c.stars.map(s => ({ ...s, ...horizontal(date, lat, lon, s, n) }));
      const up = st.filter(s => s.alt > -2);
      if (!up.length) return null;
      // 중심: 방위는 원형 평균
      const ax = Math.atan2(st.reduce((a, s) => a + Math.sin(s.az * RAD), 0), st.reduce((a, s) => a + Math.cos(s.az * RAD), 0)) / RAD;
      const alt0 = st.reduce((a, s) => a + s.alt, 0) / st.length;
      return { name: c.name, lines: c.lines, az0: ax, alt0, st };
    }).filter(Boolean);
  }
  /* ---------- 은하수 ----------
   * 하늘의 각 픽셀(절반 해상도)마다 그 방향의 은하 좌표(l, b)를 구해 밝기를 칠함:
   *   은하면을 따라 퍼진 빛 (은하 중심 쪽일수록 밝고 두꺼움) + 중심 팽대부 + 방패자리·백조자리 별구름
   *   × 여러 크기의 노이즈(얼룩진 질감) × 백조자리~궁수자리 암흑대(Great Rift)
   * 중심 쪽은 노르스름하게, 나머지는 푸르스름하게. 밝은 곳엔 작은 별가루를 뿌림. 지평선 근처는 대기에 흐려짐.
   */
  const mwCv = document.createElement("canvas");
  let mwDust = [], mwBuiltAt = 0, mwFor = 0;
  function hash2(i, j) { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, P = i => ((i % period) + period) % period;
    const a = hash2(P(xi), yi), b = hash2(P(xi + 1), yi), c = hash2(P(xi), yi + 1), d = hash2(P(xi + 1), yi + 1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(l, b, oct = 4) {                     // 0~1 근처. 경도 방향은 360°마다 이어짐
    let s = 0, amp = .5, f = 1 / 14;
    for (let o = 0; o < oct; o++) { s += amp * vnoise(l * f, b * f + 37 * o, Math.round(360 * f)); amp *= .5; f *= 2; }
    return s / (1 - Math.pow(.5, oct));
  }
  const sq = x => x * x;
  function mwIntensity(l, b) {                      // l, b: 도
    const L = ((l + 180) % 360 + 360) % 360 - 180;  // 0 = 은하 중심
    const center = Math.exp(-sq(L / 60));
    const sig = 4 + 6 * center;                     // 띠 두께(°)
    let I = (.28 + .72 * center) * Math.exp(-sq((b + .4) / sig));
    I += .7 * Math.exp(-sq(L / 11) - sq((b + 1.5) / 6.5));                            // 팽대부
    I += .35 * Math.exp(-sq((L - 27) / 6) - sq((b + 1.5) / 3.5));                     // 방패자리 별구름
    I += .3 * Math.exp(-sq((L - 76) / 9) - sq((b - 1.5) / 4));                        // 백조자리 별구름
    I += .25 * Math.exp(-sq((L - 3) / 5) - sq((b + 4) / 3));                          // 궁수자리 별구름
    const n = fbm(l, b);
    I *= .25 + 1.5 * n * n;                          // 얼룩
    const lane = (L > -15 && L < 85 ? 1 : 0) * Math.exp(-sq((b - 1.4 - .03 * Math.max(0, 30 - L)) / (1.3 + .5 * center)));
    I *= 1 - .8 * lane * (.55 + .45 * fbm(l * 1.7, b * 1.7 + 11, 3));                // 암흑대
    I *= 1 - .45 * Math.max(0, fbm(l * 1.3 + 90, b * 1.3, 3) - .55) * 2;             // 작은 암흑 성운
    return [Math.max(0, I), center];
  }
  function buildMilkyWay(date) {
    const sc = 2, W2 = Math.ceil(w / sc), H2 = Math.ceil((horizonY() + 4) / sc);
    mwCv.width = W2; mwCv.height = H2;
    const g = mwCv.getContext("2d"), id = g.createImageData(W2, H2), D = id.data;
    const jd = jdUT(date), T = (jd - J2000) / 36525, n = nutation((jdTT(date) - J2000) / 36525);
    const lst = RAD * (280.46061837 + 360.98564736629 * (jd - J2000) + .000387933 * T * T + place.lon) + n.dpsi * Math.cos(n.eps);
    const phi = place.lat * RAD, sP = Math.sin(phi), cP = Math.cos(phi);
    const aG = 192.85948 * RAD, dG = 27.12825 * RAD, lN = 122.93192 * RAD, sG = Math.sin(dG), cG = Math.cos(dG);
    const grid = new Float32Array(W2 * H2);
    for (let py = 0; py < H2; py++) for (let px = 0; px < W2; px++) {
      const x = (px + .5) * sc, y = (py + .5) * sc;
      let az = (x / w - .5) * 240;
      if (place.lat < 0) az = az > 0 ? az - 180 : az + 180;
      const alt = (horizonY() - y) / (horizonY() - h * .07) * 62;
      if (alt < -1) continue;
      const A = az * RAD, hh = Math.min(89.9, alt) * RAD;
      const dec = Math.asin(sP * Math.sin(hh) - cP * Math.cos(hh) * Math.cos(A));
      const H = Math.atan2(Math.sin(A), Math.cos(A) * sP + Math.tan(hh) * cP), ra = lst - H;
      const sd = Math.sin(dec), cd = Math.cos(dec), dr = ra - aG;
      const b = Math.asin(sd * sG + cd * cG * Math.cos(dr));
      const l = lN - Math.atan2(cd * Math.sin(dr), sd * cG - cd * sG * Math.cos(dr));
      const [I, warm] = mwIntensity(norm(l / RAD), b / RAD);
      const ext = Math.pow(Math.min(1, Math.max(0, alt / 18)), .8);                        // 지평선 쪽은 대기에 흐려짐
      const v = I * ext, k = (py * W2 + px) * 4;
      grid[py * W2 + px] = v;
      D[k] = 205 + 50 * warm; D[k + 1] = 214 + 24 * warm; D[k + 2] = 255 - 40 * warm; D[k + 3] = Math.min(150, v * 120);
    }
    g.putImageData(id, 0, 0);
    // 별가루: 밝은 곳일수록 촘촘히
    seed = 101; mwDust = [];
    for (let i = 0; i < W2 * H2 * .35; i++) {
      const px = srnd() * W2 | 0, py = srnd() * H2 | 0, v = grid[py * W2 + px];
      if (srnd() < v * .9) mwDust.push({ x: (px + srnd()) * sc, y: (py + srnd()) * sc, a: Math.min(1, .35 + v * .6) });
    }
    mwBuiltAt = Date.now();
  }
  function drawMilkyWay(vis) {
    if (vis < .02) return;
    const tn = now().getTime(), moved = Math.abs(tn - mwFor) > 4 * 60e3 && Date.now() - mwBuiltAt > 250;   // 미리보기로 시각을 옮기면 다시 그림
    if (!mwBuiltAt || Date.now() - mwBuiltAt > 2 * 60e3 || moved || mwCv.width !== Math.ceil(w / 2)) { buildMilkyWay(now()); mwFor = tn; }
    ctx.save();
    ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = vis;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mwCv, 0, 0, mwCv.width * 2, mwCv.height * 2);
    ctx.fillStyle = "#e9eeff";
    for (const p of mwDust) { ctx.globalAlpha = vis * p.a * .55; ctx.fillRect(p.x, p.y, .7, .7); }
    ctx.restore();
  }

  function drawSkyObjects() {
    const moonLight = moon.alt > 0 ? mph.fraction : 0;
    // 은하수
    if (OPT.milky) drawMilkyWay(Math.max(0, (night - .75) / .25) * (1 - overcast) * (1 - .85 * moonLight));
    // 별자리
    const vis = Math.max(0, Math.min(1, (night - .3) / .5)) * (1 - overcast);
    if (vis < .02) return;
    const k = h / 80;                                  // 별자리 모양: 1°당 픽셀 (가로·세로 같게)
    for (const c of skyStars) {
      const o = skyXY({ az: c.az0, alt: c.alt0 }), cosA = Math.cos(c.alt0 * RAD);
      const pos = s => ({ x: o.x + wrap180(s.az - c.az0) * cosA * k, y: o.y - (s.alt - c.alt0) * k });
      const P = Object.fromEntries(c.st.map(s => [s.id, { ...pos(s), s }]));
      if (OPT.lines) {
        ctx.strokeStyle = `rgba(190,205,255,${.2 * vis * (1 - .5 * moonLight)})`; ctx.lineWidth = .7;
        ctx.beginPath();
        for (const [a, b] of c.lines) if (P[a] && P[b]) { ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); }
        ctx.stroke();
      }
      for (const id in P) {
        const { x, y, s } = P[id], r = Math.max(.55, 1.9 - .38 * s.mag);
        const tw = .85 + .15 * Math.sin(t / 17 + x);
        if (s.mag < 1.5) { ctx.fillStyle = rgba(SC[s.c], .18 * vis); circle(ctx, x, y, r * 2.6); }
        ctx.fillStyle = rgba(SC[s.c], Math.min(1, (1.3 - s.mag * .15) * vis * tw)); circle(ctx, x, y, r);
      }
    }
  }

  /* ---------- 하늘의 여러 현상 (모두 동글동글한 카툰 느낌으로) ---------- */
  // 화면 위 방향 벡터 ↔ 방위·고도 (dirOf 의 반대)
  const azAltOf = v => ({ az: Math.atan2(-v[0], -v[1]) / RAD, alt: Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD });
  // 방향 c 를 중심으로 각반지름 rad(°)인 원 위의 점들 (무지개·햇무리)
  function ringPoints(c, radDeg, n) {
    const up = Math.abs(c[2]) > .95 ? [1, 0, 0] : [0, 0, 1];
    let u = [c[1] * up[2] - c[2] * up[1], c[2] * up[0] - c[0] * up[2], c[0] * up[1] - c[1] * up[0]];
    const ul = Math.hypot(...u); u = u.map(x => x / ul);
    const v = [c[1] * u[2] - c[2] * u[1], c[2] * u[0] - c[0] * u[2], c[0] * u[1] - c[1] * u[0]];
    const cr = Math.cos(radDeg * RAD), sr = Math.sin(radDeg * RAD), out = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, p = [0, 1, 2].map(k => cr * c[k] + sr * (Math.cos(a) * u[k] + Math.sin(a) * v[k]));
      out.push(azAltOf(p));
    }
    return out;
  }
  function strokeRing(pts, minAlt) {                 // 지평선 위 부분만, 화면 끝을 넘는 곳은 끊어서
    ctx.beginPath();
    let pen = false, last = null;
    for (const p of pts) {
      if (p.alt < minAlt) { pen = false; continue; }
      const q2 = skyXY(p);
      if (pen && last && Math.abs(q2.x - last.x) < w / 3) ctx.lineTo(q2.x, q2.y); else ctx.moveTo(q2.x, q2.y);
      pen = true; last = q2;
    }
    ctx.stroke();
  }

  /* 층별 구름: 낮은 구름(뭉게구름, 기존), 중간 구름(양떼구름: 작은 솜뭉치 무리), 높은 구름(새털구름: 붓으로 쓱 그은 결)
   * 색은 그 높이까지 대기를 지나온 햇빛 색 → 노을 땐 높은 구름이 먼저·오래 물들고 낮은 구름은 어두운 실루엣 */
  let altoC = [], cirrusC = [], veilC = [], lowTint = "#ffffff", lowLit = 1, highLit = 1;
  function buildLayerClouds() {
    const cm = W && W.cm != null ? W.cm / 100 : fx.cloud * .4, ch = W && W.ch != null ? W.ch / 100 : fx.cloud * .3;
    seed = 31;
    const nA = Math.round(cm * 5) + (cm > .12 ? 1 : 0), nCi = Math.round(ch * 6) + (ch > .12 ? 1 : 0);
    if (altoC.length !== nA) altoC = Array.from({ length: nA }, () => ({ x: srnd() * (w + 160) - 80, y: h * (.07 + srnd() * .16), cols: 4 + (srnd() * 4 | 0), rows: 2 + (srnd() * 2 | 0), s: U * (.016 + srnd() * .008), v: .02 + srnd() * .02, ph: srnd() * 9 }));
    // 엷은 면구름(권층운): 높은 구름이 하늘을 많이 덮으면 위쪽 하늘에 결 따라 긴 붓자국을 깔아 둠
    const nV = ch > .35 ? Math.round((ch - .35) / .65 * w / 22) + 4 : 0;
    seed = 37;
    if (veilC.length !== nV) veilC = Array.from({ length: nV }, () => {
      const y = horizonY() * (.06 + .8 * Math.pow(srnd(), .8));
      return { x: srnd() * (w + 300) - 150, y, len: w * (.12 + srnd() * .3), th: U * (.03 + srnd() * .07) * (.6 + y / horizonY()), tilt: (srnd() - .5) * h * .03, a: .1 + srnd() * .12, v: .03 + srnd() * .03 };
    });
    seed = 33;
    if (cirrusC.length !== nCi) cirrusC = Array.from({ length: nCi }, () => ({ x: srnd() * (w + 200) - 100, y: h * (.04 + srnd() * .16), len: w * (.08 + srnd() * .14), curl: (srnd() - .5) * h * .05, n: 3 + (srnd() * 3 | 0), v: .05 + srnd() * .05, ph: srnd() * 9 }));
  }
  function drawLayerClouds() {
    const dim = 1 - night * .85;
    if (veilC.length) {                               // 엷은 면구름: 해 질 녘엔 해 쪽은 주황, 위로 갈수록 분홍, 반대쪽은 연보라로 물듦
      const glow = Math.min(1, dusk * 1.4 + (sun.alt < 0 ? .5 : 0)) * highLit;
      const sx = skyXY(sun).x, hy = horizonY();
      ctx.save(); ctx.lineCap = "round";
      for (const c of veilC) {
        c.x += c.v * (1 + fx.wind * .4); if (c.x > w + 150) c.x = -c.len - 150;
        const mx = c.x + c.len / 2, near = Math.exp(-(((mx - sx) / (w * .4)) ** 2)), low = c.y / hy;
        let col = mix("#f4f2f6", mix(mix(trailTint, "#ff86a8", .45 * (1 - low)), "#b9a3d6", .6 * (1 - near)), glow * (.55 + .45 * Math.max(near, low)));
        col = mix(col, "#3a4366", night * (1 - highLit * .5) * .85);
        ctx.strokeStyle = col;
        for (const [wd, al] of [[1, .55], [.45, 1]]) {   // 넓고 옅게 한 번, 가운데를 조금 진하게 한 번
          ctx.globalAlpha = Math.min(.6, c.a * al * Math.max(dim, highLit * .8) * (1 + 1.3 * glow));   // 물들면 더 진하게
          ctx.lineWidth = c.th * wd;
          ctx.beginPath(); ctx.moveTo(c.x, c.y);
          ctx.quadraticCurveTo(c.x + c.len * .5, c.y + c.tilt, c.x + c.len, c.y - c.tilt * .3); ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (cirrusC.length) {                             // 새털구름 (높은 하늘: 해가 진 뒤에도 잠깐 물듦)
      const col = mix(mix("#ffffff", trailTint, Math.min(1, dusk * 1.3 + (sun.alt < 0 ? .6 : 0)) * highLit), "#3a4366", night * (1 - highLit * .5) * .85);
      ctx.strokeStyle = col; ctx.lineCap = "round";
      for (const c of cirrusC) {
        c.x += c.v * (1 + fx.wind * .5); if (c.x > w + c.len) c.x = -c.len * 1.2;
        for (let i = 0; i < c.n; i++) {
          const oy = (i - c.n / 2) * U * .012, ox = i * c.len * .06;
          ctx.globalAlpha = (.28 + .1 * Math.sin(c.ph + i)) * Math.max(dim, highLit * .8) * (1 - overcast * .5);
          ctx.lineWidth = 1.2 + (i % 2) * 1.2;
          ctx.beginPath(); ctx.moveTo(c.x + ox, c.y + oy);
          ctx.quadraticCurveTo(c.x + ox + c.len * .5, c.y + oy + c.curl, c.x + ox + c.len, c.y + oy - c.curl * .4);
          ctx.quadraticCurveTo(c.x + ox + c.len * 1.06, c.y + oy - c.curl * .7, c.x + ox + c.len * 1.02, c.y + oy - c.curl);   // 끝이 살짝 말림
          ctx.stroke();
        }
      }
    }
    if (altoC.length) {                               // 양떼구름 (중간 높이)
      const base = mix(mix(mix("#ffffff", "#c3cad6", overcast * .6), cloudTint, Math.min(.8, dusk * .9) * cloudLit), "#3a4366", night * .85);
      const shadow = mix(base, "#8fa6bf", .45);
      for (const c of altoC) {
        c.x += c.v * (1 + fx.wind * .6); if (c.x > w + 60) c.x = -c.cols * c.s * 3 - 20;
        for (let r = 0; r < c.rows; r++) for (let k = 0; k < c.cols; k++) {
          const x = c.x + k * c.s * 2.6 + (r % 2) * c.s * 1.3, y = c.y + r * c.s * 1.9 + Math.sin(c.ph + k) * c.s * .3;
          ctx.globalAlpha = .75 * (1 - overcast * .3);
          ctx.fillStyle = shadow; ellipse(ctx, x, y + c.s * .25, c.s * 1.05, c.s * .7);
          ctx.fillStyle = base; ellipse(ctx, x, y, c.s, c.s * .72);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* 그림자: 해 반대쪽으로, 해가 낮을수록 길게 (흐리면 옅게). 해가 남쪽이면 이쪽(아래)으로 드리움 */
  function drawShadows() {
    if (sun.alt < 1 || overcast > .85) return;
    const A = sun.az * RAD, flip = place.lat < 0 ? -1 : 1;
    const dx = -Math.sin(A) * flip, dy = Math.cos(A) * flip * .32;              // 땅 위 방향(원근으로 세로를 눌러서)
    const len = Math.min(3.2, 1 / Math.tan(Math.max(4, sun.alt) * RAD));         // 키에 대한 그림자 길이 비
    const a = .26 * (1 - overcast) * Math.min(1, sun.alt / 6);
    ctx.save(); ctx.fillStyle = `rgba(28,40,52,${a})`;
    for (const o of objs) {
      if (o.k === "flower") continue;
      const tall = o.k === "house" ? o.s * .75 : o.s * .9, wide = o.k === "house" ? o.s * .45 : o.s * .2;
      const L = tall * len, ex = dx * L, ey = dy * L;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.atan2(ey, ex));
      const d = Math.hypot(ex, ey);
      ctx.beginPath(); ctx.ellipse(d / 2, 0, d / 2 + wide * .3, wide * (o.k === "house" ? .55 : .9) * (.5 + .5 * Math.abs(dy) / .32 + .2), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* 강물 윤슬: 해·달이 낮게 떠 있으면 그 아래 강물에 반짝이는 빛 길 */
  function drawGlitter() {
    if (!RIV || RIV.frozen) return;
    const src = sun.alt > 0 ? { p: sun, c: sunTint, k: 1 - overcast } : moon.alt > 0 && night > .4 ? { p: moon, c: "#f6f1db", k: mph.fraction * (1 - overcast) * .8 } : null;
    if (!src || src.p.alt > 40 || src.k < .05) return;
    const sx = skyXY(src.p).x;
    if (sx < -40 || sx > w + 40) return;
    const spread = (6 + src.p.alt * .6) * (h / 100);
    ctx.save(); ctx.fillStyle = src.c;
    for (let i = 0; i < 26; i++) {
      const f = RIV.open ? RIV.open[0] + (RIV.open[1] - RIV.open[0]) * ((i * .37) % 1) : (i * .37) % 1;
      const y = arcY(sx, RIV.r1 - (RIV.r1 - RIV.r2) * f), x = sx + Math.sin(i * 12.9) * spread * (.4 + f);
      ctx.globalAlpha = src.k * (.35 + .65 * Math.max(0, Math.sin(t / 7 + i * 1.7)));
      ellipse(ctx, x, y, 1.6 + f * 2, .7);
    }
    ctx.restore();
  }

  /* 행성: JPL 근사 궤도요소(1800~2050)로 일심 위치 → 지구에서 본 방향. 귀여운 반짝이로 */
  const PLANETS = [   // a, e, I, L, 근일점 경도 ϖ, 승교점 Ω (값, 세기당 변화)
    ["수성", [.38709927, 3.7e-7], [.20563593, 1.906e-5], [7.00497902, -.00594749], [252.2503235, 149472.67411175], [77.45779628, .16047689], [48.33076593, -.12534081], "#e8dccb", .2],
    ["금성", [.72333566, 3.9e-6], [.00677672, -4.107e-5], [3.39467605, -7.889e-4], [181.9790995, 58517.81538729], [131.60246718, .00268329], [76.67984255, -.27769418], "#fff6d6", -4.2],
    ["지구", [1.00000261, 5.62e-6], [.01671123, -4.392e-5], [-1.531e-5, -.01294668], [100.46457166, 35999.37244981], [102.93768193, .32327364], [0, 0]],
    ["화성", [1.52371034, 1.847e-5], [.0933941, 7.882e-5], [1.84969142, -.00813131], [-4.55343205, 19140.30268499], [-23.94362959, .44441088], [49.55953891, -.29257343], "#ffb08a", .5],
    ["목성", [5.202887, -1.1607e-4], [.04838624, -1.3253e-4], [1.30439695, -.00183714], [34.39644051, 3034.74612775], [14.72847983, .21252668], [100.47390909, .20469106], "#fff0d8", -2.3],
    ["토성", [9.53667594, -.0012506], [.05386179, -5.0991e-4], [2.48599187, .00193609], [49.95424423, 1222.49362201], [92.59887831, -.41897216], [113.66242448, -.28867794], "#f3e3b8", .6]
  ];
  function helio(el, T) {
    const v = i => el[i][0] + el[i][1] * T;
    const a = v(1), e = v(2), I = v(3) * RAD, L = v(4), wb = v(5), Om = v(6) * RAD;
    const M = ((L - wb) % 360) * RAD, om = (wb - v(6)) * RAD;
    let E = M + e * Math.sin(M);
    for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(om), sw = Math.sin(om), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
    return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
            (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
            sw * sI * xp + cw * sI * yp];
  }
  let planets = [];
  function computePlanets(date) {
    const T = (jdTT(date) - J2000) / 36525, eps = 23.43928 * RAD, n = nutation(T);
    const E = helio(PLANETS[2], T);
    planets = PLANETS.filter(p => p[0] !== "지구").map(p => {
      const P = helio(p, T), g = [P[0] - E[0], P[1] - E[1], P[2] - E[2]];
      const x = g[0], y = g[1] * Math.cos(eps) - g[2] * Math.sin(eps), z = g[1] * Math.sin(eps) + g[2] * Math.cos(eps);
      const eq = { ra: Math.atan2(y, x), dec: Math.atan2(z, Math.hypot(x, y)) };
      const pos = horizontal(date, place.lat, place.lon, eq, n);
      const r = Math.hypot(...P), d = Math.hypot(...g);
      const mag = p[0] === "화성" ? -1.52 + 5 * Math.log10(r * d) : p[8];
      return { name: p[0], col: p[7], mag, az: pos.az, alt: pos.alt };
    });
  }
  function drawPlanets() {
    for (const p of planets) {
      if (p.alt < 1) continue;
      const need = p.mag < -3.5 ? -3 : p.mag < -1.5 ? -5 : -7;                  // 밝은 행성일수록 초저녁부터 보임
      const vis = Math.max(0, Math.min(1, (need - sun.alt) / 3)) * (1 - overcast);
      if (vis < .05) continue;
      const { x, y } = skyXY(p), r = Math.max(1.1, 2.2 - .3 * p.mag) * (U / 110) * OPT.planet;
      ctx.save(); ctx.globalAlpha = vis;
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 4); g2.addColorStop(0, rgba(p.col, .45)); g2.addColorStop(1, rgba(p.col, 0));
      ctx.fillStyle = g2; circle(ctx, x, y, r * 4);
      if (p.mag < -1.5) {                                                        // 밝은 행성: 네 갈래 반짝
        const s = r * (2.6 + .4 * Math.sin(t / 10 + x));
        ctx.fillStyle = rgba(p.col, .8);
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
      }
      ctx.fillStyle = p.col; circle(ctx, x, y, r);
      if (p.name === "토성") { ctx.strokeStyle = rgba(p.col, .9); ctx.lineWidth = .8; ctx.beginPath(); ctx.ellipse(x, y, r * 2.1, r * .7, -.3, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
  }

  /* 유성: 실제 유성우 날짜와 복사점. 복사점에서 뻗어 나가는 방향으로 떨어짐 (평소에도 가끔 산발 유성) */
  const SHOWERS = [   // 이름, 극대 월·일, 활동 반폭(일), ZHR, 복사점 적경·적위(°)
    ["사분의자리", 1, 3, 1.5, 110, 230, 49], ["거문고자리", 4, 22, 3, 18, 271, 34], ["물병자리 에타", 5, 6, 6, 50, 338, -1],
    ["페르세우스자리", 8, 12, 9, 100, 48, 58], ["오리온자리", 10, 21, 6, 20, 95, 16], ["사자자리", 11, 17, 3, 15, 152, 22], ["쌍둥이자리", 12, 14, 3, 150, 112, 33]
  ];
  let meteors = [], radiants = [];
  function computeMeteors(date, localYmd) {
    const n = nutation((jdTT(date) - J2000) / 36525), y = +localYmd.slice(0, 4);
    radiants = SHOWERS.map(([name, m, d, half, zhr, ra, dec]) => {
      const days = Math.abs((Date.parse(localYmd) - Date.UTC(y, m - 1, d)) / 864e5);
      const act = Math.exp(-sq(days / half));
      if (act < .05 && !(PREVIEW && q.has("meteor"))) return null;
      const p = horizontal(date, place.lat, place.lon, { ra: ra * RAD, dec: dec * RAD }, n);
      return { name, rate: zhr * (PREVIEW && q.has("meteor") ? 1 : act) * Math.max(0, Math.sin(p.alt * RAD)), az: p.az, alt: p.alt };
    }).filter(Boolean);
  }
  function stepDrawMeteors() {
    const dark = Math.max(0, (night - .6) / .4) * (1 - overcast);
    if (dark > .05) {
      // 시간당 개수: 유성우 + 산발 6개. 화면이 하늘의 일부라 실제보다 조금 자주 보이게
      const perHour = radiants.reduce((s, r) => s + r.rate, 0) * 1.4 + 6;
      if (rnd() < perHour / 3600 / 30 * dark * 3 || (PREVIEW && q.has("meteor") && !meteors.length)) {
        const r = radiants.length && rnd() < 1 - 6 / perHour ? radiants[rnd() * radiants.length | 0] : null;
        const x = w * (.1 + rnd() * .8), y = h * (.05 + rnd() * .3);
        let dx = rnd() - .5, dy = .5 + rnd() * .3;
        if (r) { const R = skyXY(r); dx = x - R.x; dy = y - R.y; }
        const L = Math.hypot(dx, dy) || 1;
        meteors.push({ x, y, dx: dx / L, dy: dy / L, life: 0, max: 16 + rnd() * 10, len: h * (.25 + rnd() * .2) });
      }
    }
    meteors = meteors.filter(m => {
      m.life++;
      const k = m.life / m.max, hx = m.x + m.dx * m.len * k, hy = m.y + m.dy * m.len * k;
      const tx = hx - m.dx * m.len * .45, ty = hy - m.dy * m.len * .45;
      const a = Math.sin(Math.PI * k) * Math.max(dark, .4);
      const g2 = ctx.createLinearGradient(tx, ty, hx, hy); g2.addColorStop(0, "rgba(255,248,220,0)"); g2.addColorStop(1, `rgba(255,248,220,${a})`);
      ctx.strokeStyle = g2; ctx.lineWidth = 1.3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = `rgba(255,252,235,${a})`; circle(ctx, hx, hy, 1.2);
      return m.life < m.max;
    });
  }

  /* 무지개: 비가 오는데 해가 42°보다 낮게 비칠 때, 해 반대편(반태양점)을 중심으로 42° (바깥 51°에 희미한 쌍무지개) */
  function rainbowOn() {
    if (PREVIEW && q.has("rainbow")) return true;
    if (!W || sun.alt <= 0 || sun.alt >= 42) return false;
    const showery = (W.code >= 51 && W.code <= 65) || (W.code >= 80 && W.code <= 82);
    return showery && (W.cloud == null || W.cloud < 92);
  }
  function drawRainbow() {
    if (!rainbowOn()) return;
    const s = dirOf(sun.az, sun.alt), anti = s.map(x => -x);
    const C = ["#ff8a8a", "#ffb877", "#ffe48a", "#9fe39a", "#8cc8ff", "#b49bff"];
    ctx.save(); ctx.lineCap = "round";
    const a = .62 * (1 - Math.max(0, overcast - .6));
    C.forEach((c, i) => { ctx.strokeStyle = rgba(c, a); ctx.lineWidth = h * .022; strokeRing(ringPoints(anti, 42.3 - i * .45, 90), -2); });
    C.slice().reverse().forEach((c, i) => { ctx.strokeStyle = rgba(c, a * .3); ctx.lineWidth = h * .014; strokeRing(ringPoints(anti, 50.5 + i * .5, 90), -2); });
    ctx.restore();
  }

  /* 햇무리·달무리: 얇은 높은 구름(권층운)이 깔렸을 때 해·달 둘레 22° */
  function drawHalo() {
    const ch = W && W.ch != null ? W.ch : 0, cl = W && W.cl != null ? W.cl : 0;
    const force = PREVIEW && q.has("halo");
    if (!force && !(ch >= 40 && cl < 40 && !fx.rain)) return;
    const src = sun.alt > 3 ? { p: sun, k: 1 } : moon.alt > 3 && mph.fraction > .5 && night > .5 ? { p: moon, k: .55 } : null;
    if (!src) return;
    const pts = ringPoints(dirOf(src.p.az, src.p.alt), 22, 90);
    ctx.save(); ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(255,240,228,${.36 * src.k})`; ctx.lineWidth = h * .035; strokeRing(pts, -1);
    ctx.strokeStyle = `rgba(255,180,160,${.18 * src.k})`; ctx.lineWidth = h * .01; strokeRing(ringPoints(dirOf(src.p.az, src.p.alt), 21.3, 90), -1);
    ctx.restore();
  }

  /* 아침 안개: 맑고 바람 없는 새벽, 습도가 높으면 강가 낮은 곳에 몽글몽글 깔렸다가 해가 오르면 걷힘 */
  let localHour = 12;
  function mistAmount() {
    if (PREVIEW && q.has("mist")) return +q.get("mist") || 1;
    if (!W || W.rh == null) return 0;
    const morning = localHour >= 3 && localHour <= 10;
    const calm = (W.wind == null ? 5 : W.wind) < 9;
    const humid = Math.max(0, (W.rh - 85) / 12);
    return morning && calm ? Math.min(1, humid) * Math.max(0, 1 - Math.max(0, sun.alt) / 12) : 0;
  }
  function drawMist() {
    const m = mistAmount();
    if (m < .03 || !RIV) return;
    const col = night > .5 ? "#aab3cc" : mix("#f3f6fa", sunTint, dusk * .4);
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const x = ((i * 97 + t * .15 * (1 + (i % 3) * .3)) % (w + 120)) - 60, f = (i % 4) / 4;
      const y = arcY(x, RIV.r1 - (RIV.r1 - RIV.r2) * f) - U * .02, r = U * (.07 + (i % 3) * .025);
      ctx.globalAlpha = .38 * m; ctx.fillStyle = col; ellipse(ctx, x, y, r * 2.4, r * .6);
    }
    const g2 = ctx.createLinearGradient(0, h * .45, 0, h); g2.addColorStop(0, rgba(col, 0)); g2.addColorStop(.35, rgba(col, .38 * m)); g2.addColorStop(1, rgba(col, .15 * m));
    ctx.globalAlpha = 1; ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* ---------- 강 얼음 ----------
   * 지난 이틀의 시간별 기온으로 '얼음 점수'(°C·시간)를 쌓음: 영하인 시간엔 추운 만큼 쌓이고,
   * 영상인 시간엔 1.5배 빠르게 녹음 (0~150). 점수에 따라 강가부터 얼음이 자라 가운데까지 덮이고, 따뜻해지면 저절로 녹음.
   */
  function iceScoreOf(H) {
    let sc = 0;
    (H.time || []).forEach((tm, i) => {
      const T = (H.temperature_2m || [])[i];
      if (tm * 1e3 > Date.now() || T == null) return;
      sc = Math.min(150, Math.max(0, sc + (T < 0 ? -T : -1.5 * T)));
    });
    return sc;
  }
  function iceCover() {
    if (PREVIEW && q.has("ice")) return Math.max(0, Math.min(1, +q.get("ice")));
    if (W && W.iceScore != null) return smooth(Math.max(0, Math.min(1, (W.iceScore - 15) / 75)));
    return temp != null && temp <= -6 ? .5 : 0;           // 기온 기록이 없으면 지금 기온으로만 대강
  }

  /* ---------- 나무의 계절: 그해 기온 이력으로 계산 (생물계절 모델) ----------
   * 일별 최고·최저·평균기온, 일조시간, 바람 (Open-Meteo: 최근 92일은 예보 API, 그 이전은 과거 기상 API)을 하루 한 번 받아서
   *   새순·잎:  생육도일 GDD = Σ max(0, 일평균 − 5°C) (1월 1일부터). 100 에서 새순, 350 이면 잎이 다 자람
   *   벚꽃:     2월 1일부터 일 최고기온 누적이 600°C 가 되는 날 개화 ("600도 법칙"), 4일쯤 만개, 열흘 남짓 지나면 짐
   *   단풍:     8월 1일부터 서늘함 누적 Σ max(0, 17°C − 일평균). 14 에서 물들기 시작, 90 즈음 절정
   *             (일 최저기온이 처음 5°C 아래로 내려가면 그 전이라도 물들기 시작)
   *   단풍 색:  물드는 동안 맑은 날이 많고 밤이 서늘할수록(영하는 아님) 붉고 선명, 흐리고 따뜻하면 누렇고 탁함
   *   낙엽:     서늘함 누적 125 이후 줄고, 된서리(최저 −2°C 이하)·강풍마다 더 떨어짐
   * 나무 종류: 단풍나무(빨강), 은행나무(노랑, 늦게 물들고 한꺼번에 짐), 벚나무(봄꽃, 일찍 물듦), 느티나무(주황·갈색),
 *   감나무(8월부터 초록 감 → 단풍 따라 주황으로 익음, 잎이 다 져도 감은 가지에 남고 12월 이후엔 까치밥 몇 개만)
   * 남반구·열대처럼 모델이 맞지 않는 곳이나 자료가 없을 때는 날짜 기준(기존 방식)으로 그림.
   */
  const PHENO_KEY = "planner-pheno";
  let PH = null;
  const SPECIES = ["maple", "maple", "ginkgo", "cherry", "zelkova", "persimmon"];
  const AUTUMN = { maple: ["#e4553c", "#ff8c62"], ginkgo: ["#f2c12e", "#ffe26a"], cherry: ["#ea7a3c", "#ffb066"], zelkova: ["#d47d3a", "#f4a75e"], persimmon: ["#e66a36", "#fba552"] };
  const DULL = ["#b98a50", "#dcb072"];                // 흐리고 따뜻한 가을의 탁한(누런) 색
  const GREEN = { spring: ["#a8cf7f", "#cfe6a8"], summer: ["#3b8550", "#6db46b"] };
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const ymdUTC = ms => new Date(ms).toISOString().slice(0, 10);

  async function loadPheno() {
    const date = now(), off = W && W.offset != null ? W.offset : -date.getTimezoneOffset();
    const today = ymdUTC(date.getTime() + off * 60e3), y = +today.slice(0, 4), m = +today.slice(5, 7);
    const start = m >= 8 ? `${y}-08-01` : `${y}-01-01`;
    const key = `${(+place.lat).toFixed(2)},${(+place.lon).toFixed(2)},${start},${today}`;
    try { const c = JSON.parse(localStorage.getItem(PHENO_KEY)); if (c && c.key === key) { PH = phenology(c.days, today); return; } } catch (e) {}
    const D = "temperature_2m_max,temperature_2m_min,temperature_2m_mean,sunshine_duration,wind_speed_10m_max";
    const ll = `latitude=${place.lat}&longitude=${place.lon}`, days = new Map();
    const take = j => (j && j.daily && j.daily.time || []).forEach((d, i) => {
      const v = k => j.daily[k][i];
      if (v("temperature_2m_max") != null) days.set(d, { tx: v("temperature_2m_max"), tn: v("temperature_2m_min"), tm: v("temperature_2m_mean"), sun: (v("sunshine_duration") || 0) / 3600, wind: v("wind_speed_10m_max") || 0 });
    });
    try {
      const recent = Date.now() - Date.parse(today) < 3 * 864e5;            // 미리보기로 과거 날짜를 보면 과거 자료만
      const cut = ymdUTC(Date.parse(today) - (recent ? 88 : 0) * 864e5);
      if (start < cut) {
        const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${ll}&start_date=${start}&end_date=${cut}&daily=${D}&timezone=auto`);
        if (r.ok) take(await r.json());
      }
      if (recent) {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?${ll}&daily=${D}&past_days=92&forecast_days=1&timezone=auto`);
        if (r.ok) take(await r.json());
      }
    } catch (e) {}
    const list = [...days].filter(([d]) => d >= start && d <= today).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, v]) => ({ d, ...v }));
    if (list.length < 10) { PH = null; return; }
    try { localStorage.setItem(PHENO_KEY, JSON.stringify({ key, days: list })); } catch (e) {}
    PH = phenology(list, today);
  }

  function phenology(days, today) {
    if (place.lat < 23 || place.lat > 62) return null;                       // 남반구·열대·고위도는 날짜 기준
    const m = +today.slice(5, 7), r = { gdd: 0, dts: 0, bloomDay: null, cool: 0, firstCold: null, sunSum: 0, coolNights: 0, colorDays: 0, frosts: 0, windy: 0 };
    for (const v of days) {
      if (m < 8) {                                                            // 봄~여름
        r.gdd += Math.max(0, v.tm - 5);
        if (v.d >= today.slice(0, 4) + "-02-01") { r.dts += Math.max(0, v.tx); if (!r.bloomDay && r.dts >= 600) r.bloomDay = v.d; }
      } else {                                                                // 가을~초겨울
        r.cool += Math.max(0, 17 - v.tm);
        if (!r.firstCold && v.tn < 5) r.firstCold = v.d;
        if (r.cool > 10 || r.firstCold) { r.colorDays++; r.sunSum += v.sun; if (v.tn > 0 && v.tn < 9) r.coolNights++; }
        if (v.tn <= -2) r.frosts++;
        if (v.wind >= 40) r.windy++;
      }
    }
    const P = { model: true };
    if (m < 8) {
      P.buds = clamp01((r.gdd - 60) / 80) * (1 - clamp01((r.gdd - 200) / 120));
      P.leafOut = clamp01((r.gdd - 100) / 250);
      P.summer = clamp01((r.gdd - 350) / 700);                                // 여름으로 갈수록 짙은 초록
      const since = r.bloomDay ? (Date.parse(today) - Date.parse(r.bloomDay)) / 864e5 : -99;
      P.bloom = since < 0 ? (r.dts > 520 ? (r.dts - 520) / 80 * .3 : 0) : since < 4 ? .4 + since * .15 : since < 9 ? 1 : since < 15 ? 1 - (since - 9) / 6 : 0;
      P.color = 0; P.leaf = 1; P.falling = 0; P.redness = .6;
      P.fruit = m <= 2 ? .15 : 0; P.ripe = 1;                                  // 겨울엔 까치밥 몇 개
      P.info = `생육도일 ${Math.round(r.gdd)} · 벚꽃 누적 ${Math.round(r.dts)}°C` + (r.bloomDay ? ` (개화 ${r.bloomDay.slice(5)})` : "");
    } else {
      const start = r.firstCold ? Math.max(r.cool, 15) : r.cool;
      P.color = clamp01((start - 14) / 76);
      const sunny = r.colorDays ? r.sunSum / r.colorDays : 6, cool = r.colorDays ? r.coolNights / r.colorDays : .5;
      P.redness = clamp01(-.2 + .07 * sunny + .65 * cool);                    // 맑고 서늘한 밤 → 붉고 선명
      P.leaf = clamp01(1 - clamp01((r.cool - 125) / 95) - .15 * r.frosts - .04 * r.windy);
      P.falling = P.color > .3 ? clamp01(1 - P.leaf) * P.leaf * 4 : 0;         // 지는 중일 때 낙엽이 날림
      P.buds = 0; P.leafOut = 1; P.summer = 1; P.bloom = 0;
      P.ripe = clamp01(.15 + P.color * 1.3);
      P.fruit = m === 12 ? .3 : P.leaf > .3 ? 1 : .45 + P.leaf;
      P.info = `서늘함 누적 ${Math.round(r.cool)} · 단풍 ${Math.round(P.color * 100)}% · 붉은 정도 ${Math.round(P.redness * 100)}%`;
    }
    return P;
  }

  // 나무 한 그루의 잎 양·꽃·색 (종류별로 조금씩 다르게)
  function treeLook(o) {
    const sp = o.sp;
    if (!PH) return null;
    let col = PH.color, leaf = PH.leaf;
    if (sp === "cherry") { col = clamp01(PH.color * 1.35 + .05); leaf = clamp01(PH.leaf - .15); }
    if (sp === "ginkgo") { col = clamp01((PH.color - .2) * 1.5); leaf = PH.leaf > .35 ? 1 : PH.leaf / .35; }
    if (sp === "zelkova") col = clamp01(PH.color * .95);
    if (PH.leafOut < 1) leaf = Math.min(leaf, PH.leafOut);
    const green = GREEN.spring.map((c, i) => mix(c, GREEN.summer[i], PH.summer));
    const target = sp === "maple" ? AUTUMN.maple.map((c, i) => mix(DULL[i], c, PH.redness)) : sp === "ginkgo" ? AUTUMN.ginkgo
                 : AUTUMN[sp].map((c, i) => mix(DULL[i], c, .4 + .6 * PH.redness));
    // 초록 → 노랑 → 목표색 순서로 (초록과 빨강을 바로 섞으면 갈색으로 탁해짐)
    const k = clamp01(col * 1.2), turn = target.map(c => mix(c, "#ecc84c", .55));
    const step = (g2, t2, u) => k < .5 ? mix(g2, u, k * 2) : mix(u, t2, (k - .5) * 2);
    let base = step(green[0], target[0], turn[0]), hi = step(green[1], target[1], turn[1]);
    const bloom = sp === "cherry" ? PH.bloom : 0;
    base = mix(base, "#f4bfcf", bloom); hi = mix(hi, "#fde4ec", bloom);
    const fruit = sp === "persimmon" ? PH.fruit : 0, ripe = PH.ripe;
    return { leaf: Math.max(leaf, bloom * .9), bloom, buds: PH.buds, base, hi, fruit, ripe };
  }

  /* ---------- 상태 ---------- */
  let on, w = 0, h = 0, U = 128, dpr = 1, pxr = 1, cssW = 0, cssH = 0, raf = 0, last = 0, t = 0, painted = 0, flash = 0;
  let place = DEFAULT_PLACE, W = null, Wnow = null, scrub = null, wxState = "idle", wxTimer = 0;
  let S = KF[0], doy = 0, sun = { az: 0, alt: 30 }, moon = { az: 0, alt: -10 }, mph = { fraction: .5, phase: .25 };
  let night = 0, dusk = 0, fx = weatherFx(null), overcast = 0, snowCover = 0, frost = false, temp = null;
  const skyL = document.createElement("canvas"), landL = document.createElement("canvas");
  let grain = null, parts = [], stars = [], clouds = [], yGround = () => h, chimney = null, windowAt = null, bolt = null;
  try { on = localStorage.getItem(KEY); } catch (e) {}
  on = on ? on === "on" : !matchMedia("(prefers-reduced-motion: reduce)").matches;
  try { const p = JSON.parse(localStorage.getItem(PLACE_KEY)); if (p && isFinite(p.lat) && isFinite(p.lon)) place = p; } catch (e) {}

  const q = new URLSearchParams(location.search);
  const PREVIEW = ["localhost", "127.0.0.1"].includes(location.hostname) && (q.has("date") || q.has("hour") || q.has("wx"));
  // 지금 시각 (하루 미리보기 슬라이더로 고른 시각이 있으면 그 시각)
  const now = () => scrub != null ? new Date(scrub) : nowReal();
  function nowReal() {
    if (!PREVIEW) return new Date();
    // 미리보기 날짜·시각은 설정한 위치의 현지 시각으로 해석
    const off = W && W.offset != null ? W.offset : Math.round(place.lon / 15) * 60;
    const base = new Date(Date.now() + off * 60e3);
    const [y, m, d] = q.has("date") ? q.get("date").split("-").map(Number) : [base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()];
    const hr = q.has("hour") ? +q.get("hour") : base.getUTCHours();
    return new Date(Date.UTC(y, m - 1, d) + hr * 36e5 - off * 60e3);          // hour=17.5 처럼 소수도 됨
  }

  let seed = 1;
  const srnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rnd = Math.random;

  /* ---------- 날씨 받아오기 ---------- */
  // 받아 온 날씨는 Wnow, 화면에 쓰는 날씨는 W (미리보기 중이면 그 시각의 시간별 예보)
  async function loadWeather(force) {
    await fetchWeather(force);
    Wnow = W;
    if (scrub != null) W = weatherAt(scrub);
    if (mode !== "band") buildDay();                 // 슬라이더 바탕(시간별 예보)도 새로
  }
  function weatherAt(ms) {                          // 그 시각의 시간별 예보 (숫자는 앞뒤 시각 사이를 이어서)
    const B = Wnow, R = B && B.hr;
    if (!R || !R.t || !R.t.length) return B;
    const s = ms / 1e3;
    let i = R.t.findIndex(x => x > s) - 1;
    if (i < 0) i = s < R.t[0] ? 0 : R.t.length - 2;
    const f = Math.max(0, Math.min(1, (s - R.t[i]) / ((R.t[i + 1] - R.t[i]) || 1)));
    const at = k => { const a = R[k] && R[k][i], b = R[k] && R[k][i + 1]; return a == null ? b : b == null ? a : a + (b - a) * f; };
    return { ...B, code: R.code[f < .5 ? i : i + 1] ?? B.code, temp: at("temp"), cloud: at("cloud"), cl: at("cl"), cm: at("cm"), ch: at("ch"), wind: at("wind"), rh: at("rh"), vis: at("vis") };
  }
  async function fetchWeather(force) {
    if (PREVIEW && q.has("wx")) {
      const n = k => q.has(k) ? +q.get(k) : null;
      W = { code: +q.get("wx"), temp: n("temp") ?? 10, cloud: +q.get("wx") >= 3 ? 90 : 20, wind: 10, offset: Math.round(place.lon / 15) * 60,
            rh: n("rh") ?? 55, vis: n("vis"), cl: n("cl"), cm: n("cm"), ch: n("ch"), aod: n("aod"), dust: n("dust"), t250: n("t250") ?? -48, rh250: n("rh250") ?? 50, ws250: 120, wd250: 270 };
      wxState = "ok"; return;
    }
    const key = `${(+place.lat).toFixed(2)},${(+place.lon).toFixed(2)}`;
    if (!force) {
      try { const c = JSON.parse(localStorage.getItem(WX_KEY)); if (c && c.key === key && Date.now() - c.at < 20 * 60e3) { W = c.data; wxState = "ok"; return; } } catch (e) {}
    }
    wxState = "loading"; updateUi();
    try {
      // 지상 날씨 + 순항 고도(250 hPa) 기온·습도·바람, 그리고 대기질(에어로졸 광학 두께·황사)
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}`
              + `&current=temperature_2m,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,relative_humidity_2m,visibility`
              + `&hourly=temperature_2m,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,relative_humidity_2m,visibility,temperature_250hPa,relative_humidity_250hPa,wind_speed_250hPa,wind_direction_250hPa&past_days=2&forecast_days=2&timeformat=unixtime&timezone=auto`;
      const aq = fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}&current=aerosol_optical_depth,dust`)
        .then(r => r.ok ? r.json() : null).catch(() => null);
      const r = await fetch(u);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), c = j.current, H = j.hourly || {};
      let k = 0;                                   // 지금과 가장 가까운 시각
      (H.time || []).forEach((tm, i) => { if (Math.abs(tm * 1e3 - Date.now()) < Math.abs(H.time[k] * 1e3 - Date.now())) k = i; });
      const at = name => H[name] && H[name][k] != null ? H[name][k] : null;
      const a = (await aq || {}).current || {};
      W = { code: c.weather_code, temp: c.temperature_2m, cloud: c.cloud_cover, wind: c.wind_speed_10m, offset: (j.utc_offset_seconds || 0) / 60,
            rh: c.relative_humidity_2m, vis: c.visibility, cl: c.cloud_cover_low, cm: c.cloud_cover_mid, ch: c.cloud_cover_high, aod: a.aerosol_optical_depth ?? null, dust: a.dust ?? null,
            t250: at("temperature_250hPa"), rh250: at("relative_humidity_250hPa"), ws250: at("wind_speed_250hPa"), wd250: at("wind_direction_250hPa"),
            iceScore: iceScoreOf(H),
            hr: { t: H.time, code: H.weather_code, temp: H.temperature_2m, cloud: H.cloud_cover, cl: H.cloud_cover_low, cm: H.cloud_cover_mid,
                  ch: H.cloud_cover_high, wind: H.wind_speed_10m, rh: H.relative_humidity_2m, vis: H.visibility } };
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
    computeSkyObjects(n);
    night = Math.min(1, Math.max(0, (-sun.alt - 2) / 10));                         // 해가 -2° 아래로 가면 어두워짐
    dusk = Math.max(0, 1 - Math.abs(sun.alt - 1.5) / 8) * (1 - night * .6);
    fx = weatherFx(W);
    temp = W ? W.temp : null;
    // 하늘을 얼마나 가리나: 낮은 구름은 거의 불투명, 중간 구름은 꽤, 높은 새털·면구름(권운·권층운)은 햇빛이 대부분 통과.
    // (예보의 '흐림'은 높은 구름만 100% 여도 나오므로 높이별 구름 양으로 계산)
    const opq = W && W.cl != null && W.cm != null && W.ch != null ? 1 - (1 - .95 * W.cl / 100) * (1 - .75 * W.cm / 100) * (1 - .2 * W.ch / 100) : fx.cloud;
    overcast = Math.min(.92, opq * .55 + (fx.rain || fx.snow ? .3 : 0) + fx.storm * .2 + fx.fog * .2);
    const winter = bump(doy, 20, 40);
    snowCover = fx.snow > 0 ? Math.min(1, .55 + fx.snow * .25) : winter * (temp != null && temp <= 0 ? .55 : temp == null ? .25 : .1);
    frost = temp != null && temp <= 2 && sun.alt < 20;
    fest = festivalOn(local.toISOString().slice(0, 10));
    localHour = local.getUTCHours() + local.getUTCMinutes() / 60;
    computePlanets(n); computeMeteors(n, local.toISOString().slice(0, 10));
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
    const P = o.pal || TC, leaf = o.leafAmt != null ? o.leafAmt : Math.max(S.leaf, S.bloom * .9);   // 종류별 색·잎 양 (treeLook)
    const bloomA = o.bloomAmt != null ? o.bloomAmt : S.bloom, budsA = o.budsAmt != null ? o.budsAmt : S.buds;
    const cx = x + sway, cy = y - s * .72;
    if (leaf > .05) {
      const k = .62 + .38 * leaf;
      g.globalAlpha = Math.min(1, leaf * 1.5);
      g.fillStyle = P.outline;
      for (const [bx, by, r] of BLOBS) circle(g, cx + bx * s * k, cy + by * s * k, r * s * k + 1.1);
      g.fillStyle = P.leafD;
      for (const [bx, by, r] of BLOBS) circle(g, cx + bx * s * k, cy + by * s * k, r * s * k);
      g.save();
      g.beginPath(); for (const [bx, by, r] of BLOBS) { g.moveTo(cx + bx * s * k + r * s * k, cy + by * s * k); g.arc(cx + bx * s * k, cy + by * s * k, r * s * k, 0, TAU); }
      g.clip();
      g.fillStyle = P.leaf;
      for (const [bx, by, r] of BLOBS) circle(g, cx + bx * s * k, cy + (by - .07) * s * k, r * s * k * .93);
      g.fillStyle = P.leafL;
      circle(g, cx - s * .1 * k, cy - s * .22 * k, s * .1 * k); circle(g, cx + s * .09 * k, cy - s * .27 * k, s * .055 * k);
      g.restore();
      g.globalAlpha = 1;
      persimmons(g, o, [[-.2, .02], [.13, -.08], [.02, .13], [.22, .07], [-.08, -.18], [-.25, -.12]].map(([a, b]) => [cx + a * s * k, cy + b * s * k]));
      if (bloomA > .2) {
        g.fillStyle = `rgba(255,255,255,${.85 * bloomA})`;
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
      if (budsA > .1) { g.fillStyle = rgba(SH("#a9d47a"), budsA); for (const [ex, ey] of tips) circle(g, ex, ey, Math.max(1, s * .035)); }
      persimmons(g, o, tips.map(([ex, ey]) => [ex, ey + s * .05]));             // 잎이 진 감나무: 가지 끝에 매달린 감
      if (snowCover > .3) { g.fillStyle = `rgba(255,255,255,${snowCover})`; for (const [ex, ey] of tips) ellipse(g, ex, ey - 1, s * .05, s * .025); }
    }
  }
  // 감: 동글납작한 열매 + 꼭지. 덜 익으면 초록, 익을수록 주황
  function persimmons(g, o, spots) {
    const n = Math.round((o.fruitAmt || 0) * spots.length);
    if (!n) return;
    const r = Math.max(2.1, o.s * .06), col = SH(mix("#8fb24e", "#f28a22", o.ripe || 0));
    for (const [x, y] of spots.slice(0, n)) {
      g.fillStyle = col; ellipse(g, x, y, r * 1.1, r * .92);
      g.fillStyle = "rgba(255,255,255,.35)"; circle(g, x - r * .35, y - r * .3, r * .28);
      g.fillStyle = SH("#4f6b2e"); ellipse(g, x, y - r * .85, r * .55, r * .22);
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
    c.width = cvs.width; c.height = cvs.height;
    const g = c.getContext("2d"); g.setTransform(pxr, 0, 0, pxr, 0, 0); return g;
  }

  function paintBg() {
    compute();
    const grey = mix(mix("#a3abb4", "#5a6370", fx.storm * .7 + Math.min(1, fx.rain / 3) * .3), "#1d2333", night);

    const shade = (c, k = .62) => mix(mix(c, grey, overcast * .25), NIGHT_TINT, night * k);
    SH = shade;

    // 하늘: 대기 산란 계산 (위 paintSky)
    let g = setup(skyL);
    const skyC = paintSky(g, grey);

    // 땅 모양
    G = { R: 1e7, cx: w / 2, cy: 0 };                // 아주 큰 원 = 평평한 들판 (풍경 사진처럼)
    G.cy = h * .52 + G.R;
    g = setup(landL);
    const haze = skyC[1];
    // 지평선 너머 먼 언덕
    const farY = x => h * .515 - h * .045 * (.5 + .5 * Math.sin(x * .011 + 1.1)) - h * .022 * (.5 + .5 * Math.sin(x * .027 + 2.3));
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
    const ice = iceCover(), frozen = ice > .98;
    const span = h - h * .52;
    RIV = { r1: G.R - span * .26, r2: G.R - span * .46 };
    g.fillStyle = shade(mix(S.hill[0], "#efe1bd", .7 * (1 - snowCover * .7))); arcBand(g, G.R - span * .23, G.R - span * .49); g.fill();
    const wg = g.createLinearGradient(0, h * .52 + span * .26, 0, h * .52 + span * .46);
    wg.addColorStop(0, shade(frozen ? "#e6f3f8" : "#a6e3ee", .7)); wg.addColorStop(1, shade(frozen ? "#c8e2ec" : "#5fbfd2", .7));
    g.fillStyle = wg; arcBand(g, RIV.r1, RIV.r2); g.fill();
    g.strokeStyle = rgba("#ffffff", .5 * (1 - night * .6)); g.lineWidth = 1;
    g.beginPath(); for (let x = -12; x <= w + 12; x += 4) g.lineTo(x, arcY(x, RIV.r1) + 1); g.stroke();
    if (ice > .02) {                               // 강가부터 얼음이 자람
      const wdt = RIV.r1 - RIV.r2, e = wdt * Math.min(.5, ice * .5);
      const ic = shade(mix("#e3f1f6", "#ffffff", snowCover * .7), .7), edge = shade("#a9cfdd", .7);
      g.fillStyle = ic;
      if (frozen) { arcBand(g, RIV.r1, RIV.r2); g.fill(); }
      else { arcBand(g, RIV.r1, RIV.r1 - e); g.fill(); arcBand(g, RIV.r2 + e, RIV.r2); g.fill(); }
      g.strokeStyle = edge; g.lineWidth = .8;
      for (const r of frozen ? [] : [RIV.r1 - e, RIV.r2 + e]) {     // 울퉁불퉁한 얼음 가장자리
        g.beginPath(); for (let x = -12; x <= w + 12; x += 3) g.lineTo(x, arcY(x, r) + Math.sin(x * .37 + r) * .8); g.stroke();
      }
      seed = 21; g.strokeStyle = rgba(edge, .7); g.lineWidth = .6;                // 얼음 금
      for (let i = 0; i < w / 50; i++) {
        const x = srnd() * w, f = frozen ? .15 + srnd() * .7 : srnd() < .5 ? srnd() * ice * .45 : 1 - srnd() * ice * .45, y = arcY(x, RIV.r1 - wdt * f);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3 + srnd() * 4, y + (srnd() - .5) * 2); g.lineTo(x + 6 + srnd() * 5, y + (srnd() - .5) * 2.5); g.stroke();
      }
    }
    RIV.frozen = frozen;
    RIV.open = frozen ? [.5, .5] : [ice * .5, 1 - ice * .5];       // 물이 보이는 폭 (강 폭 비율)
    const inRiver = (x, y) => y > arcY(x, G.R - span * .21) && y < arcY(x, G.R - span * .51);
    // 풀 무늬
    seed = 55;
    g.strokeStyle = rgba(shade(mix(S.hill[1], "#24402a", .3)), .5 * (1 - snowCover * .85)); g.lineCap = "round";
    for (let i = 0; i < w / 5 * tallK(); i++) {
      const x = srnd() * w, d = .03 + srnd() * .97, y = depthY(x, d), z = 1.6 + 2.6 * depthS(d);
      if (inRiver(x, y)) continue;
      g.lineWidth = .7 + .5 * d;
      g.beginPath(); g.moveTo(x - z * .5, y - z * .7); g.quadraticCurveTo(x - z * .15, y - z * .1, x, y); g.quadraticCurveTo(x + z * .15, y - z * .1, x + z * .5, y - z * .7); g.stroke();
    }
    if (frost) {
      g.fillStyle = "rgba(255,255,255,.6)";
      seed = 7;
      for (let i = 0; i < w / 4 * tallK(); i++) { const x = srnd() * w, y = depthY(x, srnd()); if (!inRiver(x, y)) circle(g, x, y, .7); }
    }
    yGround = x => depthY(x, .55 + Math.random() * .4);

    // 나무·집·꽃 자리와 색 (나무와 꽃은 매번 흔들리며 그림)
    const leafBase = mix(S.c1, "#f4bfcf", S.bloom), leafHi = mix(S.c2, "#fde4ec", S.bloom);
    TC = {
      trunk: shade("#8b5e3c", .55), outline: shade(mix(leafBase, "#1d2b1d", .38)), leaf: shade(leafBase),
      leafD: shade(mix(leafBase, "#1f3326", .22)), leafL: shade(mix(leafHi, "#ffffff", .22)),
      pine: shade(S.pine, .6), pineL: shade(mix(S.pine, "#ffffff", .16), .6), pineO: shade(mix(S.pine, "#0b1a10", .5), .6),
      wall: shade("#f8eedb", .6), wallD: shade("#e6d5b4", .6), roof: shade("#e2745c", .6), roofL: shade("#f0937c", .6),
      chimney: shade("#c9775f", .6), door: shade("#a06d48", .6), glass: shade("#9fc3d8", .6), houseO: shade("#7a5442", .6),
      stem: shade("#5f9b4e"), flowerC: shade("#ffe07a")
    };
    objs = [];
    seed = 101;
    const hx = w * .62, hd = .6;
    objs.push({ k: "house", x: hx, y: depthY(hx, hd), s: U * .42 * depthS(hd) });
    const pool = SPECIES.filter(sp => OPT.species[sp]);       // 켜 둔 활엽수 종류
    const kind = p => { const r = srnd(); return !pool.length ? "cedar" : !OPT.species.cedar ? "round" : r < p ? "cedar" : "round"; };
    const nb = Math.max(2, Math.round(w / 70 * OPT.trees));
    for (let i = 0; i < nb; i++) {                  // 강 건너 뒷줄 (작게)
      const x = (i + .2 + srnd() * .6) * w / nb, d = .02 + srnd() * .06;
      objs.push({ k: kind(.45), x, y: depthY(x, d), s: U * (.34 + srnd() * .08) * depthS(d), ph: srnd() * TAU, fruit: false });
    }
    const nf = Math.max(2, Math.round(w / 135 * OPT.trees));
    for (let i = 0; i < nf; i++) {                  // 강 이쪽 앞줄
      const x = (i + .15 + srnd() * .7) * w / nf, d = .62 + srnd() * .22;
      if (Math.abs(x - hx) < U * .45) continue;
      objs.push({ k: kind(.35), x, y: depthY(x, d), s: U * (.42 + srnd() * .1) * depthS(d), ph: srnd() * TAU,
                  fruit: S.leaf > .8 && bump(doy, 250, 70) > .3 && srnd() < .5 });
    }
    if (tallK() > 1.4) {                            // 크게 볼 때는 땅이 넓어지니 강 건너 중간 줄과 강가 줄을 더 심음
      const nm = Math.round(w / 95 * OPT.trees);
      for (let i = 0; i < nm; i++) {
        const x = (i + .1 + srnd() * .8) * w / nm, d = .11 + srnd() * .1;
        objs.push({ k: kind(.4), x, y: depthY(x, d), s: U * (.36 + srnd() * .08) * depthS(d), ph: srnd() * TAU, fruit: false });
      }
      const nn = Math.round(w / 240 * OPT.trees);
      for (let i = 0; i < nn; i++) {
        const x = (i + .2 + srnd() * .6) * w / nn, d = .5 + srnd() * .06;
        if (Math.abs(x - hx) < U * .55) continue;
        objs.push({ k: kind(.3), x, y: depthY(x, d), s: U * (.4 + srnd() * .08) * depthS(d), ph: srnd() * TAU, fruit: false });
      }
    }
    const bloomAmt = Math.max(bump(doy, 115, 45), bump(doy, 190, 45) * .8, bump(doy, 255, 25) * .5) * (1 - snowCover);
    const FC = ["#f7a1b5", "#ffd36e", "#ffffff", "#b9a6ff", "#ff9f80"];
    for (let i = 0; i < Math.round(w / 16 * bloomAmt * tallK()); i++) {
      const x = srnd() * w, d = .68 + srnd() * .3;
      if (Math.abs(x - hx) < U * .3) continue;
      objs.push({ k: "flower", x, y: depthY(x, d), s: 2.4 + 3.2 * depthS(d), ph: srnd() * TAU, c: shade(FC[(srnd() * FC.length) | 0]) });
    }
    const rounds = objs.filter(o => o.k === "round");
    rounds.forEach(o => { o.sp = pool[(hash2(Math.round(o.x * 3), 17) * pool.length) | 0]; o.fruit = false; });
    const front = rounds.filter(o => o.y > h * .7).sort((a, b) => b.s - a.s);
    if (OPT.species.persimmon && front.length && !front.some(o => o.sp === "persimmon")) front[front.length > 1 ? 1 : 0].sp = "persimmon";   // 앞줄에 감나무 하나
    for (const o of objs) {                         // 활엽수: 종류를 정하고 그해 기온 이력으로 색·잎 양
      if (o.k !== "round") continue;
      const L = treeLook(o);
      if (!L) continue;
      o.leafAmt = L.leaf; o.bloomAmt = L.bloom; o.budsAmt = L.buds; o.fruitAmt = L.fruit; o.ripe = L.ripe;
      o.pal = { outline: shade(mix(L.base, "#1d2b1d", .38)), leaf: shade(L.base), leafD: shade(mix(L.base, "#1f3326", .22)), leafL: shade(mix(L.hi, "#ffffff", .22)) };
    }
    for (const o of rounds) if (o.sp === "persimmon" && o.fruitAmt == null) {   // 계절 자료가 없으면 날짜로 대강
      o.fruitAmt = doy > 225 ? (doy > 335 ? .3 : 1) : doy < 50 ? .15 : 0; o.ripe = Math.max(0, Math.min(1, (doy - 245) / 45));
    }
    if (fest && fest.key === "chuseok") rounds.forEach(o => { if (o.sp === "persimmon") { o.fruitAmt = 1; o.ripe = Math.max(o.ripe || 0, .7); } });
    objs.sort((a, b) => a.y - b.y);
    seed = 77;
    sparkles = RIV.frozen ? [] : Array.from({ length: Math.round(w / 40) }, () => ({ x: srnd() * w, f: .2 + srnd() * .6, ph: srnd() * TAU, len: 3 + srnd() * 5 }));

    // 별
    seed = 3;
    stars = Array.from({ length: Math.round(w * h / 900) }, () => ({ x: srnd() * w, y: srnd() * h * .45, r: .4 + srnd() * .9, ph: srnd() * TAU }));
    seed = 9;
    const lowAmt = W && W.cl != null ? W.cl / 100 : fx.cloud;
    const nC = Math.round(lowAmt * 7 + (fx.rain || fx.snow ? 3 : 0) + (lowAmt > .05 ? 1 : 0));
    buildLayerClouds();
    if (clouds.length !== nC) clouds = Array.from({ length: nC }, () =>
      ({ x: srnd() * (w + 200) - 100, y: h * (.1 + srnd() * .22), s: Math.sqrt(h * U) * (.14 + srnd() * .1) * (1 + overcast * .5), v: .03 + srnd() * .05 }));
    painted = Date.now();
    amb("update", ambState());
  }

  function drawMoon(x, y, r, alpha) {
    const { fraction } = mph;
    ctx.save(); ctx.globalAlpha = alpha;
    if (night > .3) {                               // 달무리
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      rg.addColorStop(0, `rgba(246,241,219,${.22 * fraction})`); rg.addColorStop(1, "rgba(246,241,219,0)");
      ctx.fillStyle = rg; circle(ctx, x, y, r * 5);
    }
    const earthshine = fraction < .4 ? .22 * (1 - fraction / .4) * night : 0;            // 지구조
    ctx.fillStyle = `rgba(200,208,232,${(night > .3 ? .16 : .08) + earthshine})`; circle(ctx, x, y, r);   // 어두운 부분
    // 밝은 쪽이 실제로 태양을 향하는 방향으로 돌려서 그림 (초승달·그믐달의 기울기까지).
    // 화면에서 동쪽은 북반구 왼쪽(남쪽을 봄), 남반구 오른쪽(북쪽을 봄)
    const east = place.lat < 0 ? 1 : -1, th = moon.limb || 0;
    const k = 1 - 2 * fraction;                     // 1 삭, -1 보름 (명암 경계 타원의 가로 반지름 비)
    ctx.translate(x, y); ctx.rotate(Math.atan2(-Math.cos(th), east * Math.sin(th)));
    ctx.fillStyle = "#f6f1db";
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    ctx.fill();
    ctx.restore();
    moonRabbit(x, y, r);
  }

  /* ---------- 움직이는 것: 실제 날씨 + 계절 생물 ---------- */
  function spawn() {
    spawnPlane(PREVIEW && q.has("plane") && !planes.length);
    if (parts.length > 300 * tallK()) return;
    const wind = fx.wind;
    const drop = (rate, make) => { for (let r = rate; r > 0; r -= 1) if (rnd() < r) parts.push(make()); };
    const x0 = () => rnd() * (w + 120) - 60 - wind * 30;
    drop(fx.rain * 1.6, () => { const d = .5 + rnd() * .8; return { k: "rain", x: x0() + 30, y: -12, d, len: (fx.rain > 1 ? 10 : 7) * d * fall(), vy: (fx.rain > 1 ? 7 : 5) * d * fall() }; });
    drop(fx.snow * .9, () => { const d = .5 + rnd() * .8; return { k: "snow", x: x0(), y: -4, d, r: (fx.snow > 1 ? 1.1 : .8) * (1 + d), vy: (.35 + d * .45) * fall(), ph: rnd() * TAU }; });
    const calm = fx.rain < 1.5 && fx.snow < 1 && !fx.storm;
    if (calm) {
      drop(.35 * (PH ? PH.bloom * .7 : S.bloom) * (fx.rain ? .5 : 1), () => { const d = .5 + rnd() * .8; return { k: "petal", x: x0() - 30, y: -4, d, vy: .45 + d * .35, rot: rnd() * TAU, spin: (rnd() - .5) * .12, ph: rnd() * TAU, c: rnd() < .5 ? "#f8cfdc" : "#ef9fb8" }; });
      drop(PH ? .4 * PH.falling : .25 * bump(doy, 300, 22), () => { const d = .5 + rnd() * .8; return { k: "leaf", x: x0(), y: -6, d, vy: .5 + d * .4, rot: rnd() * TAU, spin: (rnd() - .5) * .1, ph: rnd() * TAU, c: ["#d65f2c", "#f2a83f", "#b8451f", "#e07d34"][rnd() * 4 | 0] }; });
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
      amb("thunder", (bx / w) * 1.6 - .8);                                           // 소리를 켰으면 천둥 (거리만큼 늦게)
    }
  }

  function step() {
    stepPlanes();
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

  const blit = c => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.setTransform(pxr, 0, 0, pxr, 0, 0); };

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    blit(skyL);

    if (night > .25 && overcast < .7) {
      ctx.globalAlpha = Math.min(1, (night - .25) * 1.6) * (1 - overcast);
      for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${.25 + .35 * Math.max(0, Math.sin(t / 25 + s.ph))})`; circle(ctx, s.x, s.y, s.r * .75); }
      ctx.globalAlpha = 1;
    }
    drawSkyObjects();
    drawPlanets();
    stepDrawMeteors();
    if (moon.alt > -3 && mph.fraction > .02) {
      const m = skyXY(moon);
      drawMoon(m.x, m.y, U * .07 * (fest && fest.key === "chuseok" ? 1.45 : 1), (night > .3 ? 1 : .55) * (1 - overcast * .8));
    }
    if (sun.alt > -4) {                             // 지평선 아래로 가는 것은 땅층이 가려줌
      const p = skyXY(sun), r = U * .085;               // 색은 대기를 지나온 햇빛 색 (paintSky)
      ctx.globalAlpha = 1 - overcast * .85;
      const rg = ctx.createRadialGradient(p.x, p.y, r * .5, p.x, p.y, r * 4.5);
      rg.addColorStop(0, rgba(sunTint, .55)); rg.addColorStop(1, rgba(sunTint, 0));
      ctx.fillStyle = rg; circle(ctx, p.x, p.y, r * 4.5);
      ctx.fillStyle = mix(sunTint, "#ffffff", sun.alt > 12 ? .45 : .15); circle(ctx, p.x, p.y, r);
      ctx.globalAlpha = 1;
    }
    drawHalo();
    drawLayerClouds();                              // 높은 구름·중간 구름
    drawPlanes();                                   // 비행기는 구름 뒤 (순항 고도)
    drawRainbow();
    const cc = mix(mix(mix(mix("#ffffff", "#aeb5bf", Math.min(1, overcast * 1.1)), "#6b7380", fx.storm * .8), lowTint, Math.min(.85, dusk * .9) * lowLit), "#3a4366", night * .85);
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
        if (RIV.open && (p.f < RIV.open[0] + .03 || p.f > RIV.open[1] - .03)) continue;   // 언 곳은 반짝이지 않음
        const x = ((p.x + t * .25 * (1 + fx.wind * .5)) % (w + 20)) - 10;
        const y = arcY(x, RIV.r1 - (RIV.r1 - RIV.r2) * p.f);
        ctx.globalAlpha = .25 + .75 * Math.max(0, Math.sin(t / 12 + p.ph));
        ctx.beginPath(); ctx.moveTo(x - p.len / 2, y); ctx.lineTo(x + p.len / 2, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    drawGlitter();                                  // 해·달 윤슬
    drawShadows();
    const wind = 1 + fx.wind * 1.5;                 // 뒤에 있는 것부터 그림
    for (const o of objs) {
      if (o.k === "house") { cottage(ctx, o); decorateHouse(o); }
      else if (o.k === "flower") flower(ctx, o, Math.sin(t / 22 + o.ph) * o.s * .18 * wind);
      else {
        const sway = Math.sin(t / 40 + o.ph) * o.s * .018 * wind;
        if (o.k === "cedar") { cedar(ctx, o, sway); decorateCedar(o, sway); } else { roundTree(ctx, o, sway); decorateRound(o, sway); }
      }
    }
    if (windowAt) {
      const rg = ctx.createRadialGradient(windowAt.x, windowAt.y, 0, windowAt.x, windowAt.y, windowAt.r);
      rg.addColorStop(0, `rgba(255,214,122,${.35 * Math.max(night, dusk * .6, overcast * .4)})`); rg.addColorStop(1, "rgba(255,214,122,0)");
      ctx.fillStyle = rg; circle(ctx, windowAt.x, windowAt.y, windowAt.r);
    }
    drawFestSky(); drawFestFront();                 // 기념일 장식
    drawMist();
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
  const thinOnly = () => W && W.code === 3 && W.cl != null && W.cm != null && W.cl + W.cm < 25 && W.ch > 40;   // 높은 구름만 덮인 '흐림'
  const weatherText = () => wxState === "loading" ? "날씨 불러오는 중" : wxState === "error" ? "날씨를 못 불러옴"
                          : W ? `${Math.round(W.temp)}° ${thinOnly() ? "옅은 구름" : WX_TEXT(W.code)}` : "";
  const notify = () => dispatchEvent(new CustomEvent("planner:scene"));
  function updateUi(term) {
    if (term !== undefined) {
      termChip.replaceChildren();
      const fl = fest && fest.label;
      if (fl) { const b = document.createElement("b"); b.textContent = fl; termChip.append(b); }
      if (term) {
        const b = document.createElement("b"); b.textContent = "오늘은 " + term[1];
        termChip.append(fl ? " · " : "", b, ` ${term[2]} · ${term[3]}`);
      }
    }
    const wt = weatherText();
    placeBtn.textContent = place.name + (wt ? " · " + wt : "");
    placeBtn.title = "위치 바꾸기 (설정)" + (PH && PH.info ? "\n나무: " + PH.info : "");
    notify();
  }
  // 풍경 위 위치 표시를 누르면 설정 창의 위치 항목을 엶
  placeBtn.addEventListener("click", () => dispatchEvent(new CustomEvent("planner:open-settings", { detail: { section: "place" } })));

  function setPlace(p) {
    place = p;
    try { localStorage.setItem(PLACE_KEY, JSON.stringify(p)); } catch (e) {}
    W = Wnow = null;
    PH = null;
    loadWeather(true).then(loadPheno).then(refresh);
    refresh();
  }
  // 설정 창(app.js)에서 쓰는 기능
  window.PlannerScene = {
    isOn: () => on,
    setOn: v => { on = !!v; try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {} if (!on) setMode("band"); apply(); notify(); },
    place: () => ({ ...place }),
    weather: weatherText,
    setPlace,
    async search(text) {
      const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=8&language=ko&format=json`)).json();
      return (r.results || []).sort((a, b) => (b.population || 0) - (a.population || 0))
        .map(x => ({ name: x.name, detail: [x.admin2, x.admin1, x.country].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude }));
    },
    pheno: () => PH,
    opts: () => JSON.parse(JSON.stringify(OPT)),
    setOpt(key, v) {                                // key: "trees" · "species.maple" · "lines" …
      const [a, b] = key.split(".");
      if (b) OPT[a][b] = v; else OPT[a] = v;
      try { localStorage.setItem(OPT_KEY, JSON.stringify(OPT)); } catch (e) {}
      if (key === "speed") syncSpeed(); else if (w) { paintBg(); draw(); }
      notify();
    },
    locate: () => new Promise((ok, no) => {
      if (!navigator.geolocation) return no(new Error("이 브라우저는 현재 위치를 지원하지 않습니다."));
      navigator.geolocation.getCurrentPosition(
        p => { setPlace({ name: "현재 위치", lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }); ok(); },
        () => no(new Error("현재 위치를 가져오지 못했습니다.")), { timeout: 10000 });
    })
  };

  /* ---------- 배경 소리 (ambient.js) 에 지금 장면 상태를 넘김 ---------- */
  function amb(k, ...a) { const A = window.PlannerAmbient; if (A && A.isOn()) A[k](...a); }
  function ambState() {
    return { night, sunAlt: sun.alt, hour: localHour, doy, lat: place.lat, lon: place.lon, temp, wind: W && W.wind != null ? W.wind : null,
             rain: fx.rain, snow: fx.snow, storm: fx.storm, fog: fx.fog, rh: W ? W.rh : null, snowCover, ice: iceCover(), fest: fest && fest.key };
  }
  // 풍경을 안 보고 있을 때(다른 탭, 풍경 끔)도 소리는 1분마다 날씨·시각을 따라감
  function ambRefresh() { loadWeather(false).then(() => { compute(); amb("update", ambState()); }); }
  setInterval(() => { if ((document.hidden || !on) && window.PlannerAmbient && window.PlannerAmbient.isOn()) ambRefresh(); }, 60e3);

  /* ---------- 크게 보기: 띠 → 누르면 크게 → 한 번 더 누르면 전체 화면 (라이브 배경화면) ----------
   * 전체 화면에선 시계·날짜(음력)·날씨를 크게 띄우고, 가만히 두면 3초 뒤 버튼과 마우스 커서를 숨김.
   * 화면이 꺼지지 않게 Wake Lock 을 걸어 둠. Esc · 작게 버튼으로 돌아감.
   */
  const frameEl = band.querySelector(".frame"), clockEl = band.querySelector(".season-clock");
  const soundBtn = band.querySelector(".sc-sound"), volEl = band.querySelector(".sc-vol");
  let mode = "band", idleT = 0, clockT = 0, lock = null, realFs = false;
  async function wake(v) {
    try {
      if (v && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
      else if (!v && lock) { const l = lock; lock = null; await l.release(); }
    } catch (e) {}
  }
  function poke() {
    band.classList.remove("idle"); clearTimeout(idleT);
    if (mode === "full") idleT = setTimeout(() => band.classList.add("idle"), 3000);
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    band.classList.toggle("tall", m === "tall"); band.classList.toggle("full", m === "full");
    document.documentElement.classList.toggle("scene-full", m === "full");
    clearInterval(clockT);
    if (m === "full") {
      const req = frameEl.requestFullscreen || frameEl.webkitRequestFullscreen;      // iPhone 은 없음 → 화면을 덮는 것으로 대신
      if (req) try { const r = req.call(frameEl, { navigationUI: "hide" }); if (r && r.catch) r.catch(() => {}); } catch (e) {}
      wake(true); tickClock(); clockT = setInterval(tickClock, 1000); poke();
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      wake(false); band.classList.remove("idle");
    }
    if (m === "band") { stopPlay(); if (scrub != null) setScrub(null); }
    else { buildDay(); syncScrub(); }
    if (on) resize();
    if (m === "tall") band.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function tickClock() {
    // 미리보기 중이면 고른 시각 (그 지역 시각을 이 기기 시계 숫자로 옮겨서)
    const d = scrub != null ? new Date(scrub + (offMin() + new Date().getTimezoneOffset()) * 60e3) : new Date(), H = d.getHours(), M = String(d.getMinutes()).padStart(2, "0");
    const tm = clockEl.querySelector(".ck-time"), ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const txt = `${H % 12 || 12}:${M}`;
    if (tm.dataset.v !== txt) {
      tm.dataset.v = txt;
      const sm = document.createElement("small"); sm.textContent = H < 12 ? "오전" : "오후";
      tm.replaceChildren(sm, txt);
    }
    const L = lunarDate(ymd), day = "일월화수목금토"[d.getDay()];
    clockEl.querySelector(".ck-date").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${day}요일` + (L ? ` · 음력 ${L.leap ? "윤" : ""}${L.m}월 ${L.d}일` : "");
    const wt = weatherText();
    clockEl.querySelector(".ck-wx").textContent = (scrub != null ? "미리보기 · " : "") + place.name + (wt ? " · " + wt : "");
  }
  cvs.addEventListener("click", () => {
    if (mode === "band") setMode("tall");
    else if (mode === "tall") setMode("full");
    else if (band.classList.contains("idle")) poke();
    else { clearTimeout(idleT); band.classList.add("idle"); }
  });
  cvs.title = "눌러서 크게 보기";
  band.querySelector(".sc-full").addEventListener("click", () => setMode("full"));
  band.querySelector(".sc-close").addEventListener("click", () => setMode("band"));
  frameEl.addEventListener("pointermove", e => { if (mode === "full" && e.pointerType === "mouse") poke(); });
  addEventListener("keydown", e => {
    if (e.key !== "Escape" || mode === "band" || document.querySelector("dialog[open]")) return;
    if (!document.fullscreenElement) setMode("band");                              // 진짜 전체 화면이면 브라우저가 먼저 빠져나오고 아래에서 처리
  });
  const fsChange = () => {
    const el = document.fullscreenElement || document.webkitFullscreenElement;
    if (el === frameEl) realFs = true;
    else if (realFs) { realFs = false; if (mode === "full") setMode("band"); }
    if (on) resize();
  };
  document.addEventListener("fullscreenchange", fsChange);
  document.addEventListener("webkitfullscreenchange", fsChange);
  if (window.ResizeObserver) new ResizeObserver(() => { if (on && !document.hidden) resize(); }).observe(cvs);

  // 소리 버튼·크기
  function syncSound() {
    const A = window.PlannerAmbient, v = !!(A && A.isOn());
    soundBtn.setAttribute("aria-pressed", String(v));
    band.classList.toggle("sound", v);
    if (A) volEl.value = A.volume();
  }
  soundBtn.addEventListener("click", () => { const A = window.PlannerAmbient; if (A) A.setOn(!A.isOn()); });
  volEl.addEventListener("input", () => { const A = window.PlannerAmbient; if (A) A.setVolume(+volEl.value); });
  addEventListener("planner:sound", () => {
    syncSound();
    if (window.PlannerAmbient && window.PlannerAmbient.isOn()) { if (on && w) amb("update", ambState()); else ambRefresh(); }
  });
  syncSound();

  if (PREVIEW) window.PlannerScene._sky = alt => {                  // 로컬 점검용: 해 고도별 하늘 밝기(중간값)와 높은 구름에 닿는 햇빛
    const sd = dirOf(sun.az, alt), L = [];
    for (let j = 0; j < 12; j++) for (let i = 0; i < 30; i++) {
      const a2 = Math.max(.6, (12 - j - .5) / 12 * 62);
      L.push(lum(skyRadiance(dirOf(((i + .5) / 30 - .5) * 240, a2), sd, AER)));
    }
    L.sort((x, y) => x - y);
    const at = (az, a2) => { const r = skyRadiance(dirOf(az, a2), sd, AER); return [+(lum(r) / L[180]).toFixed(2), tint(r)]; };
    return { hz: [-84, -40, 0, 40, 84].map(az => [az, at(az, 1.5), at(az, 8), at(az, 25)]), zen: at(0, 80), alt, med: L[180], T10: lum(sunTransmit(sd, AER, 10e3)), T3: lum(sunTransmit(sd, AER, 3e3)), tint: tint(sunTransmit(sd, AER, 10e3)) };
  };
  if (PREVIEW) window.PlannerScene._paintMs = ms => { scrub = ms; W = weatherAt(ms); const t0 = performance.now(); paintBg(); draw(); return performance.now() - t0; };   // 로컬 점검용
  if (PREVIEW) window.PlannerScene._dbg = () => ({ skyMed, T10: lum(sunTransmit(dirOf(sun.az, sun.alt), AER, 10e3)), sun, dusk, night, overcast, highLit, lowLit, cloudLit, trailTint, sunTint, cloudTint, lowTint });   // 로컬 점검용
  /* ---------- 하루 미리보기: 슬라이더로 오늘 0시~24시를 훑어봄 ----------
   * 고른 시각의 해·달·별 위치와 하늘색을 계산하고, 날씨는 그 시각의 시간별 예보(구름 높이별 양, 비·눈, 기온, 바람)를 씀.
   * 슬라이더 바탕은 그날 하루의 하늘빛(해 고도로)과 구름·비 예보로 칠함. ▶ 는 하루를 약 30초에 재생, '지금'은 현재 시각으로.
   */
  const scrubEl = band.querySelector(".season-scrub"), rangeEl = scrubEl.querySelector(".ss-range");
  const timeEl = scrubEl.querySelector(".ss-time"), playBtn = scrubEl.querySelector(".ss-play");
  let dayStart = 0, sunEv = [], playing = 0, scrubT = 0, paintAt = 0;
  const offMin = () => Wnow && Wnow.offset != null ? Wnow.offset : -nowReal().getTimezoneOffset();
  function fmt(ms) {
    const d = new Date(ms + offMin() * 60e3), H = d.getUTCHours();
    return `${H < 12 ? "오전" : "오후"} ${H % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
  const skyTone = a => a < -12 ? "#1c2444" : a < -6 ? mix("#1c2444", "#3e4a8c", (a + 12) / 6) : a < -1 ? mix("#3e4a8c", "#b0678a", (a + 6) / 5)
    : a < 1 ? mix("#b0678a", "#e8835a", (a + 1) / 2) : a < 6 ? mix("#e8835a", "#f2c27a", (a - 1) / 5) : mix("#a9d6f0", "#6fb3e6", Math.min(1, (a - 6) / 30));
  function buildDay() {                              // 그 지역의 오늘 자정, 일출·일몰, 슬라이더 바탕
    const off = offMin(), loc = new Date(nowReal().getTime() + off * 60e3);
    dayStart = Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate()) - off * 60e3;
    const alts = [];
    for (let m = 0; m <= 1440; m += 10) alts.push(sunPos(new Date(dayStart + m * 60e3), place.lat, place.lon).alt);
    sunEv = [];
    for (let i = 1; i < alts.length; i++) {          // 해 윗가장자리가 지평선에 닿는 때 (고도 −0.833°)
      const a = alts[i - 1] + .833, b = alts[i] + .833;
      if (a * b < 0) sunEv.push({ m: (i - 1 + a / (a - b)) * 10, up: b > 0 });
    }
    const stops = [];
    for (let m = 0; m <= 1440; m += 30) {
      const al = alts[m / 10], Wh = weatherAt(dayStart + m * 60e3);
      let c = skyTone(al);
      if (Wh) {                                      // 낮은·중간 구름이 많거나 비·눈이 오면 회색빛
        const wet = Wh.code >= 51 ? .45 : 0, dim = ((Wh.cl || 0) + .7 * (Wh.cm || 0)) / 170;
        c = mix(c, al > 0 ? "#9aa3ae" : "#353b4c", Math.min(.75, wet + .5 * dim));
      }
      stops.push(`${c} ${(m / 14.4).toFixed(1)}%`);
    }
    rangeEl.style.setProperty("--ss-grad", `linear-gradient(90deg,${stops.join(",")})`);
    rangeEl.title = sunEv.map(e => `${e.up ? "일출" : "일몰"} ${fmt(dayStart + e.m * 60e3)}`).join(" · ");
  }
  function syncScrub() {
    const t = scrub != null ? scrub : nowReal().getTime(), m = (t - dayStart) / 60e3;
    if (document.activeElement !== rangeEl || playing) rangeEl.value = Math.round(m);
    const ev = sunEv.find(e => Math.abs(e.m - m) <= 8);
    timeEl.textContent = fmt(t) + (ev ? (ev.up ? " 일출" : " 일몰") : "");
    band.classList.toggle("scrubbing", scrub != null);
  }
  function setScrub(ms) {
    scrub = ms;
    W = ms == null ? Wnow : weatherAt(ms);
    syncScrub();
    if (scrubT) return;                              // 그리기는 초당 15번 정도로 (하늘 계산이 무거움)
    scrubT = setTimeout(() => requestAnimationFrame(() => {
      scrubT = 0; paintAt = performance.now();
      if (w) { paintBg(); draw(); } else compute();
      if (mode === "full") tickClock();
    }), Math.max(0, 66 - (performance.now() - paintAt)));
  }
  function stopPlay() { if (playing) cancelAnimationFrame(playing); playing = 0; playBtn.setAttribute("aria-pressed", "false"); }
  function startPlay() {
    let m = ((scrub != null ? scrub : nowReal().getTime()) - dayStart) / 60e3, last = performance.now();
    if (m >= 1430) m = 0;
    playBtn.setAttribute("aria-pressed", "true");
    const stepFn = ts => {
      m += (ts - last) / 1000 * 1440 / OPT.speed; last = ts;   // 하루(1440분)를 OPT.speed 초에
      if (m >= 1440) { m = 1440; stopPlay(); }
      setScrub(dayStart + m * 60e3);
      if (playing) playing = requestAnimationFrame(stepFn);
    };
    playing = requestAnimationFrame(stepFn);
  }
  const SPEEDS = [30, 60, 120, 300], speedBtn = scrubEl.querySelector(".ss-speed");
  const speedText = sec => sec < 60 ? `${sec}초` : `${sec / 60}분`;
  function syncSpeed() { speedBtn.textContent = "하루 " + speedText(OPT.speed); speedBtn.title = `재생 속도: 하루를 ${speedText(OPT.speed)}에 (누르면 바뀜)`; }
  speedBtn.addEventListener("click", () => {
    window.PlannerScene.setOpt("speed", SPEEDS[(SPEEDS.indexOf(OPT.speed) + 1) % SPEEDS.length]);
  });
  syncSpeed();
  rangeEl.addEventListener("input", () => { stopPlay(); setScrub(dayStart + +rangeEl.value * 60e3); });
  scrubEl.querySelector(".ss-now").addEventListener("click", () => { stopPlay(); setScrub(null); });
  playBtn.addEventListener("click", () => playing ? stopPlay() : startPlay());
  scrubEl.addEventListener("click", e => e.stopPropagation());
  setInterval(() => { if (mode !== "band" && scrub == null) syncScrub(); }, 30e3);

  /* ---------- 루프 ---------- */
  function refresh() { if (w) { paintBg(); draw(); } else compute(); }   // 안 보일 때도 글자는 갱신
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (ts - last < 33) return;                     // 약 30fps
    last = ts; t++;
    if (Date.now() - painted > 2 * 60e3) paintBg(); // 해·달·하늘색 갱신
    spawn(); step(); draw();
  }
  // 크게 볼수록(키운 띠, 전체 화면) 장면을 z 배로 확대해서 그림. w·h 는 확대 전 크기, U 는 나무·해 같은 것의 기준 크기
  const tallK = () => Math.max(1, h / 128);                  // 땅·하늘이 넓어진 만큼 풀·꽃·눈비를 더
  const fall = () => Math.sqrt(tallK());                      // 높은 화면에선 비·눈이 더 빨리 떨어짐
  function resize() {
    const r = cvs.getBoundingClientRect();
    const W0 = Math.max(80, Math.round(r.width)), H0 = Math.max(40, Math.round(r.height));
    let nd = Math.min(2, devicePixelRatio || 1);
    if (W0 * H0 * nd * nd > 5e6) nd = Math.max(1, Math.sqrt(5e6 / (W0 * H0)));   // 큰 화면은 픽셀 수를 줄여 가볍게
    if (W0 === cssW && H0 === cssH && nd === dpr) return;
    cssW = W0; cssH = H0; dpr = nd;
    const z = Math.min(3, Math.max(1, Math.min(H0, W0 * .16) / 128));
    w = Math.round(W0 / z); h = Math.round(H0 / z); U = Math.min(h, 128); pxr = dpr * W0 / w;
    cvs.width = Math.round(W0 * dpr); cvs.height = Math.round(H0 * dpr);
    if (!grain) grain = makeGrain();
    parts = []; clouds = []; altoC = []; cirrusC = []; veilC = [];
    paintBg();
    for (let i = 0; i < 120; i++) { t++; spawn(); step(); }   // 처음부터 날씨가 화면에 퍼져 있도록
    draw();
  }
  function apply() {
    band.hidden = !on;
    cancelAnimationFrame(raf); clearInterval(wxTimer);
    if (!on || document.hidden) return;
    if (mode === "full") wake(true);                 // 탭을 다시 보면 화면 꺼짐 방지를 다시 걸어 둠
    resize();
    raf = requestAnimationFrame(frame);
    loadWeather(false).then(loadPheno).then(refresh);   // 20분 안에 받은 날씨가 있으면 그것을 씀. 나무 자료는 하루 한 번
    wxTimer = setInterval(() => loadWeather(false).then(loadPheno).then(refresh), 20 * 60e3);
  }

  addEventListener("resize", () => { if (on) resize(); });
  document.addEventListener("visibilitychange", apply);
  updateUi(null);
  apply();
})();
