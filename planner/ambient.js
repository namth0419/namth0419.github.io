/*
 * 배경 소리 (켜면 계절 풍경과 같은 날씨·시각·계절에 맞춰 실제 자연 녹음을 섞어 틀어 줌)
 * 녹음은 planner/sounds/ (위키미디어 공용의 공개 라이선스 녹음을 이음매 없이 반복되게 잘라 둔 것, 출처는 README).
 * 지금 필요한 녹음만, 소리를 켰을 때 처음 한 번 받아 옴.
 *   바람:   풍속(km/h)에 따라 산들바람 녹음 → 센 바람(숲속 강풍) 녹음으로 넘어가며 커짐
 *   비:     강수 세기만큼 커지고, 약한 비는 높은 소리를 줄여 부드럽게
 *   천둥:   화면에 번개가 치면 거리만큼 늦게 (소리는 1 km 에 약 3초). 멀수록 작고 둔하게
 *   눈:     쌓인 눈이 소리를 빨아들여 높은 소리가 줄어듦 (전체에 저역 통과). 안개도 조금
 *   강물:   졸졸. 강이 얼어 가면 그만큼 작아지고 다 얼면 멈춤. 비가 오면 조금 불어남
 *   새:     낮의 새소리, 해 뜰 무렵엔 새벽 합창. 봄·여름에 많고 비 오면 조용
 *   풀벌레: 늦여름~가을 밤. 우는 빠르기는 기온으로 (돌베어 법칙: 분당 7.2 × 기온(°C) − 32 번) — 재생 빠르기를 바꿔 맞춤
 *   개구리: 늦봄~초여름 밤(무논), 습할수록 많이 · 매미: 한여름 더운 낮
 *   풍경·썰매 방울·불꽃: 짧은 소리라 그 자리에서 합성
 * 켜고 끄기·크기는 이 브라우저에만 저장. 브라우저는 사용자가 한 번 누른 뒤에야 소리를 내게 해서, 켜 둔 채 다시 열면 첫 클릭에 시작.
 */
(function () {
  "use strict";
  const KEY = "planner-sound", DIR = "sounds/", VER = "1";
  const pref = { on: false, vol: .6 };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {} };
  const emit = () => dispatchEvent(new CustomEvent("planner:sound"));
  const rnd = Math.random, between = (a, b) => a + rnd() * (b - a);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const bump = (doy, c, wd) => { const x = Math.abs(doy - c), d = Math.min(x, 365 - x); return Math.exp(-((d / wd) ** 2)); };
  const dB = x => Math.pow(10, x / 20);

  // 녹음 (file: sounds/<file>.m4a, rms: 그 녹음의 평균 크기 dB, voices: 동시에 트는 수와 좌우 위치. 같은 녹음을 엇갈려 틀어 넓게)
  const BEDS = {
    windLight:  { file: "wind-light",  rms: -20.3 },
    windStrong: { file: "wind-strong", rms: -20.4 },
    rain:       { file: "rain",        rms: -23.7, filter: true },
    stream:     { file: "stream",      rms: -24.4, voices: [-.6, .6] },
    birdsDay:   { file: "birds-day",   rms: -22.2 },
    birdsDawn:  { file: "birds-dawn",  rms: -26.1 },
    crickets:   { file: "crickets",    rms: -20,   voices: [-.65, .1, .7] },   // 세 마리
    frogs:      { file: "frogs",       rms: -24.7, voices: [-.4, .5] },
    cicada:     { file: "cicada",      rms: -20.2, voices: [.25] }
  };
  const THUNDER = ["thunder-1", "thunder-2", "thunder-3"];

  let ac = null, out, muffle, verb, S = null, timer = 0, armed = false, bellsFrom = 0, bellsUntil = 0, NOISE = null;
  const next = {}, bufs = {}, live = {};
  const level = () => pref.vol * pref.vol * 4;            // 귀에 들리는 크기는 대략 제곱으로

  /* ---------- 도구 ---------- */
  const gain = (v = 0) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, Q = .7) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = Q; return x; };
  const chain = (...n) => { for (let i = 1; i < n.length; i++) n[i - 1].connect(n[i]); return n[n.length - 1]; };
  const ease = (param, v, tc = 1.2) => param.setTargetAtTime(v, ac.currentTime, tc);
  function pan(x, dest) {
    if (!ac.createStereoPanner) return dest;
    const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x)); p.connect(dest); return p;
  }
  function load(name) {                                // 녹음 받아서 풀기 (한 번만)
    return bufs[name] || (bufs[name] = fetch(`${DIR}${name}.m4a?v=${VER}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(a => new Promise((ok, no) => ac.decodeAudioData(a, ok, no)))
      .catch(e => { delete bufs[name]; throw e; }));
  }

  /* ---------- 깔리는 녹음: 처음 필요할 때 받아서 계속 반복 재생, 크기만 바꿈 ---------- */
  function bed(key) {
    if (live[key]) return live[key];
    const B = BEDS[key], L = live[key] = { g: gain(0), f: B.filter ? filt("lowpass", 6000, .5) : null, src: [] };
    if (L.f) chain(L.f, L.g);
    L.g.connect(muffle);
    load(B.file).then(buf => {
      const vs = B.voices || [0];
      vs.forEach((p, i) => {
        const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
        if (vs.length > 1) s.playbackRate.value = between(.97, 1.03);      // 같은 녹음이 똑같이 겹쳐 울리지 않게
        chain(s, pan(p, L.f || L.g));
        s.start(0, ((i / vs.length + rnd() * .3) % 1) * buf.duration);
        L.src.push(s);
      });
    }).catch(() => { delete live[key]; });
    return L;
  }
  function setBed(key, db, tc) {                       // db: 이 녹음을 얼마나 크게 (−∞ 이면 끔)
    if (!isFinite(db)) { if (live[key]) ease(live[key].g.gain, 0, tc); return; }
    ease(bed(key).g.gain, dB(db - BEDS[key].rms), tc);
  }

  /* ---------- 지금 상태 → 각 소리의 크기 (dB) ---------- */
  function mood() {
    const s = S || { night: 0, sunAlt: 30, hour: 12, doy: 150, lon: 127, temp: 15, wind: 8, rain: 0, snow: 0, storm: 0, fog: 0, rh: 60, ice: 0, snowCover: 0 };
    const temp = s.temp == null ? 15 : s.temp, wind = s.wind == null ? 8 : s.wind, rain = s.rain || 0;
    const wet = rain > 0 || s.storm > 0, dry = wet || s.snow > 0 ? 0 : 1;
    const day = clamp01((s.sunAlt + 8) / 10);                                     // 새는 해 뜨기 조금 전부터
    const dawn = s.hour < 12 ? Math.exp(-(((s.sunAlt - 4) / 9) ** 2)) : 0;
    const spring = .25 + .75 * Math.max(bump(s.doy, 135, 55), .75 * bump(s.doy, 205, 35), .45 * bump(s.doy, 280, 30));
    const birdWet = s.rain > 1 || s.storm ? 0 : rain > 0 || s.snow > 0 ? .35 : 1;
    const night = clamp01(s.night), off = -Infinity;
    const lin = (amt, top) => amt > .01 ? top + 20 * Math.log10(amt) : off;       // 0~1 의 양 → dB
    const strong = clamp01((wind - 18) / 17);
    return {
      windLight: -47 + 15 * clamp01((wind - 2) / 25) + 20 * Math.log10(1 - .85 * strong),
      windStrong: lin(strong, -37 + 11 * clamp01((wind - 25) / 30)),
      rain: rain ? -41 + 15 * clamp01(rain / 3.2) ** .6 : off, rainTone: 2500 + 9000 * clamp01(rain / 2),
      stream: s.ice >= .98 ? off : -43 + (wet ? 3 : 0) + 20 * Math.log10(1 - .9 * clamp01(s.ice)),
      birdsDay: lin(day * spring * birdWet * (1 - .7 * dawn) * (1 - .6 * clamp01((wind - 25) / 20)), -36),
      birdsDawn: lin(dawn * spring * birdWet, -33),
      crickets: lin(night > .4 && temp >= 10 && !wet ? bump(s.doy, 245, 45) * clamp01((temp - 8) / 10) * clamp01((night - .4) / .4) : 0, -38),
      cricketRate: Math.max(.6, Math.min(1.25, (7.2 * temp - 32) / 140)),          // 녹음은 분당 약 140번 (돌베어로 약 24°C)
      frogs: lin(night > .3 && temp >= 13 && !s.storm ? bump(s.doy, 155, 28) * clamp01(.45 + ((s.rh || 60) - 60) / 60 + (wet ? .3 : 0)) : 0, -37),
      cicada: lin(s.sunAlt > 8 && dry ? clamp01((temp - 23) / 5) * bump(s.doy, 210, 20) : 0, -37),
      muffle: s.snow > 0 ? 2600 : s.snowCover > .4 ? 6000 : s.fog ? 9000 : 18000,
      chime: dry && wind >= 5 ? 1.2 * clamp01((wind - 5) / 10) * (1 - clamp01((wind - 35) / 15)) : 0,
      storm: s.storm
    };
  }
  function setAll(M, tc) {
    for (const k in BEDS) setBed(k, M[k], tc);
    if (live.rain && live.rain.f) ease(live.rain.f.frequency, M.rainTone, tc);
    if (live.crickets) live.crickets.src.forEach((s, i) => ease(s.playbackRate, M.cricketRate * [1, .97, 1.035][i], 2));
    ease(muffle.frequency, M.muffle, tc);
  }

  /* ---------- 짧은 소리 (합성) ---------- */
  function bell(at, f, v, p, dec, parts) {             // 금속 방울: 배음이 정수배가 아님
    const dest = pan(p, verb);
    for (const [m, a, d] of parts) {
      const o = ac.createOscillator(), g = gain(0); o.frequency.value = f * m; chain(o, g, dest);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v * a, at + .003); g.gain.exponentialRampToValueAtTime(.0001, at + dec * d);
      o.start(at); o.stop(at + dec * d + .05);
    }
  }
  const CHIME = [[1, 1, 1], [2.76, .45, .5], [5.4, .25, .28], [8.93, .12, .15]];
  const JINGLE = [[1, 1, 1], [2.41, .6, .6], [4.1, .3, .35]];
  function chime(at) {                                 // 풍경: 한두 번 댕그랑
    const f = between(1380, 1520), p = between(-.4, .4);
    for (let i = 0, n = 1 + (rnd() * 3 | 0); i < n; i++) bell(at + i * between(.25, .8), f * between(.99, 1.01), .02 * between(.5, 1), p, 2.6, CHIME);
  }
  function makeVerb() {                                // 풍경·방울에만 쓰는 옅은 바깥 울림 (입구 노드를 돌려줌)
    const sr = ac.sampleRate, n = Math.round(sr * 1.4), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let y = 0; for (let i = 0; i < n; i++) { y += ((rnd() * 2 - 1) - y) * .35; d[i] = y * Math.exp(-i / sr / .35); } }
    const v = ac.createConvolver(); v.buffer = b;
    const input = gain(1); input.connect(muffle); chain(input, gain(.35), v, muffle);
    return input;
  }

  /* ---------- 시간 맞춰 내보내기 ---------- */
  function poisson(name, perMin, horizon, fn) {        // 분당 perMin 번꼴로 무작위
    const now = ac.currentTime;
    if (!(perMin > 0)) { next[name] = 0; return; }
    if (!next[name] || next[name] < now - .5) next[name] = now + -Math.log(1 - rnd()) * 60 / perMin;
    while (next[name] < now + horizon) { fn(Math.max(now, next[name])); next[name] += -Math.log(1 - rnd()) * 60 / perMin; }
  }
  function tick() {
    if (!ac || ac.state !== "running") return;
    const now = ac.currentTime, M = mood(), horizon = document.hidden ? 1.5 : .4;
    setAll(M, 3);
    poisson("chime", M.chime, horizon, chime);
    poisson("thunder", M.storm && document.hidden ? 2 : 0, horizon, () => thunder(between(-.6, .6)));   // 화면을 안 볼 땐 스스로
    if (bellsUntil > now) poisson("jingle", 240, horizon, at => {   // 썰매 방울: 왼쪽에서 오른쪽으로 지나감
      const p = -.8 + 1.6 * clamp01((at - bellsFrom) / (bellsUntil - bellsFrom));
      for (let i = 0, n = 2 + (rnd() * 4 | 0); i < n; i++) bell(at + i * .018, between(3200, 4600), .01, p, .35, JINGLE);
    });
  }

  /* ---------- 켜고 끄기 ---------- */
  function start() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // iPhone 무음 스위치와 상관없이
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = .02; comp.release.value = .5;
      comp.connect(ac.destination);
      out = gain(0); out.connect(comp);
      muffle = filt("lowpass", 18000, .5); muffle.connect(out);
      verb = makeVerb();
    }
    const r = ac.resume();                             // 누른 그 순간에 불러야 소리가 남 (특히 Safari)
    const go = () => {
      if (!pref.on) return;
      if (ac.state !== "running") { arm(); return; }
      setAll(mood(), .05);
      ease(out.gain, level(), 1.2);
      clearInterval(timer); timer = setInterval(tick, 200); tick();
    };
    if (r && r.then) r.then(go, go); else go();
  }
  function stop() {
    clearInterval(timer); timer = 0;
    if (!ac) return;
    ease(out.gain, 0, .15);
    for (const k in next) next[k] = 0;
    setTimeout(() => { if (!pref.on && ac.state === "running") ac.suspend(); }, 900);
  }
  function arm() {                                     // 브라우저는 사용자가 한 번 누른 뒤에야 소리를 냄
    if (armed) return;
    armed = true;
    const go = () => { armed = false; removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true); if (pref.on) start(); };
    addEventListener("pointerdown", go, true); addEventListener("keydown", go, true);
  }
  const playing = () => ac && pref.on && ac.state === "running";

  function thunder(p = 0) {                            // 녹음된 천둥 셋 중 하나. 멀수록 늦고 작고 둔하게
    if (!playing()) return;
    const dist = rnd(), name = THUNDER[rnd() * THUNDER.length | 0];
    load(name).then(buf => {
      const at = ac.currentTime + .4 + dist * 5, s = ac.createBufferSource(); s.buffer = buf;
      s.playbackRate.value = between(.88, 1.04);
      chain(s, filt("lowpass", 5000 - dist * 4200, .6), gain(dB(-10 - dist * 16)), pan(p * .7, muffle));
      s.start(at);
    }).catch(() => {});
  }
  function noiseBuf() {
    if (NOISE) return NOISE;
    const n = ac.sampleRate, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + .02 * (rnd() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return (NOISE = b);
  }

  window.PlannerAmbient = {
    isOn: () => pref.on,
    volume: () => pref.vol,
    setOn(v) { pref.on = !!v; save(); if (pref.on) start(); else stop(); emit(); },
    setVolume(v) { pref.vol = Math.max(0, Math.min(1, +v || 0)); save(); if (playing()) ease(out.gain, level(), .1); },
    update(state) { S = state; },
    thunder,
    pop(p = 0) {                                       // 불꽃: 조금 늦게 낮은 '펑'
      if (!playing()) return;
      const at = ac.currentTime + between(.6, 1.6), s = ac.createBufferSource(); s.buffer = noiseBuf();
      const g = gain(0); chain(s, filt("lowpass", 260, .7), g, pan(p, verb));
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.5, at + .01); g.gain.exponentialRampToValueAtTime(.0001, at + .8);
      s.start(at, rnd() * .2); s.stop(at + .9);
    },
    bells(sec = 16) { if (!playing()) return; bellsFrom = ac.currentTime; bellsUntil = bellsFrom + sec; }
  };
  if (["localhost", "127.0.0.1"].includes(location.hostname)) window.PlannerAmbient._probe = () => ({ ac, out, live, S, M: ac && mood() });   // 로컬 점검용
  if (pref.on) arm();
})();
