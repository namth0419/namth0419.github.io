/*
 * 배경 소리 (켜면 계절 풍경과 같은 날씨·시각·계절로 그 자리에서 만들어 냄. 음원 파일 없이 Web Audio 로 합성)
 *   바람:   풍속(km/h)이 셀수록 크고 높게. 돌풍은 느리게 출렁이는 무작위 값. 아주 센 바람엔 휘파람 소리
 *   비:     강수 세기만큼 쏴아 소리 + 처마·잎에 듣는 빗방울. 굵은 비는 낮은 울림까지
 *   천둥:   화면에 번개가 치면 거리만큼 늦게 (소리는 1 km 에 약 3초). 멀수록 작고 낮게 우르릉
 *   눈:     쌓인 눈이 소리를 빨아들여 높은 소리가 줄어듦 (전체에 저역 통과). 안개도 조금
 *   강물:   졸졸. 강이 얼어 가면 그만큼 작아지고 다 얼면 멈춤. 비가 오면 조금 불어남
 *   새:     해 뜨기 조금 전부터 해 질 때까지. 해 뜰 무렵이 가장 많고(새벽 합창) 봄·여름에 많음. 비 오면 조용
 *   까치:   동아시아에서 낮에 가끔 깍깍
 *   풀벌레: 늦여름~가을 밤. 우는 빠르기는 기온으로 정함 (돌베어 법칙: 분당 7.2 × 기온(°C) − 32 번)
 *   개구리: 늦봄~초여름 밤(무논), 습할수록 많이
 *   매미:   한여름 더운 낮
 *   풍경:   바람이 적당할 때 처마 끝 풍경이 가끔 댕그랑
 *   기념일: 설날 불꽃놀이 펑, 크리스마스 썰매 방울
 * 켜고 끄기·크기는 이 브라우저에만 저장. 브라우저는 사용자가 한 번 누른 뒤에야 소리를 내게 해서, 켜 둔 채 다시 열면 첫 클릭에 시작.
 */
(function () {
  "use strict";
  const KEY = "planner-sound";
  const pref = { on: false, vol: .6 };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {} };
  const emit = () => dispatchEvent(new CustomEvent("planner:sound"));
  const rnd = Math.random, between = (a, b) => a + rnd() * (b - a), TAU = Math.PI * 2;
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const bump = (doy, c, wd) => { const x = Math.abs(doy - c), d = Math.min(x, 365 - x); return Math.exp(-((d / wd) ** 2)); };

  let ac = null, out, muffle, L = {}, BUF = {}, S = null, timer = 0, armed = false;
  let gust = 1, gustTo = 1, gustAt = 0, bellsFrom = 0, bellsUntil = 0;
  const next = {}, crickets = [];
  const level = () => pref.vol * pref.vol * 4;          // 귀에 들리는 크기는 대략 제곱으로

  /* ---------- 그래프 만들기 ---------- */
  const gain = (v = 0) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, Q = .7) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = Q; return x; };
  const chain = (...n) => { for (let i = 1; i < n.length; i++) n[i - 1].connect(n[i]); return n[n.length - 1]; };
  const ease = (param, v, tc = 1.2) => param.setTargetAtTime(v, ac.currentTime, tc);
  function loop(buf) { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, rnd() * buf.duration); return s; }
  function pan(x, dest) {
    if (!ac.createStereoPanner) return dest;
    const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x)); p.connect(dest); return p;
  }
  function noiseBuf(kind, sec = 6) {
    const n = Math.round(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const x = rnd() * 2 - 1;
        if (kind === "white") d[i] = x;
        else if (kind === "pink") {                    // Paul Kellet 의 분홍 잡음 필터
          b0 = .99886 * b0 + x * .0555179; b1 = .99332 * b1 + x * .0750759; b2 = .969 * b2 + x * .153852;
          b3 = .8665 * b3 + x * .3104856; b4 = .55 * b4 + x * .5329522; b5 = -.7616 * b5 - x * .016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * .5362) * .11; b6 = x * .115926;
        } else { last = (last + .02 * x) / 1.02; d[i] = last * 3.5; }
      }
      if (kind === "brown") { const k = d[n - 1] - d[0]; for (let i = 0; i < n; i++) d[i] -= k * i / (n - 1); }   // 이음매에서 '틱' 하지 않게
    }
    return b;
  }
  function dropBuf(f0) {                               // 물방울 하나: 높이가 살짝 올라가는 짧은 '퐁'
    const sr = ac.sampleRate, n = Math.round(sr * .08), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += TAU * f0 * (1 + 7 * t) / sr;
      d[i] = Math.sin(ph) * Math.exp(-t / .016) * (1 - Math.exp(-t / .0008)) + (rnd() * 2 - 1) * Math.exp(-t / .0015) * .35;
    }
    return b;
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // iPhone 무음 스위치와 상관없이
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = .01; comp.release.value = .4;
    comp.connect(ac.destination);
    out = gain(0); out.connect(comp);
    muffle = filt("lowpass", 16000, .5); muffle.connect(out);
    BUF.white = noiseBuf("white"); BUF.pink = noiseBuf("pink"); BUF.brown = noiseBuf("brown");
    BUF.drops = [1500, 2100, 2800, 3600].map(dropBuf);
    // 바람
    L.windF = filt("lowpass", 350, .6); L.wind = gain();
    chain(loop(BUF.brown), L.windF, L.wind, muffle);
    L.whistleF = filt("bandpass", 800, 9); L.whistle = gain();
    chain(loop(BUF.white), L.whistleF, L.whistle, muffle);
    // 비
    L.rainF = filt("lowpass", 5000, .5); L.rain = gain();
    chain(loop(BUF.pink), filt("highpass", 400, .5), L.rainF, L.rain, muffle);
    L.rumble = gain(); chain(loop(BUF.brown), filt("lowpass", 220, .6), L.rumble, muffle);
    // 강물: 좁은 대역 셋이 이리저리 움직이며 졸졸 + 바탕 흐름
    L.river = gain(); L.river.connect(muffle);
    L.brook = [0, 1, 2].map(i => { const f = filt("bandpass", 600 + i * 350, 6), g = gain(.5); chain(loop(BUF.white), f, g, L.river); return { f, g }; });
    chain(loop(BUF.pink), filt("lowpass", 800, .5), gain(.5), L.river);
    // 매미: 높은 대역 잡음을 '맴맴' 빠르기로 흔듦
    L.cicada = gain(); L.cicadaAm = gain(.5); L.cicadaLfo = ac.createOscillator(); L.cicadaLfo.frequency.value = 7;
    chain(L.cicadaLfo, gain(.5), L.cicadaAm.gain); L.cicadaLfo.start();
    chain(loop(BUF.white), filt("bandpass", 5200, 4), L.cicadaAm, L.cicada, pan(.3, muffle));
    for (let i = 0; i < 4; i++) crickets.push({ f: between(3900, 4900), p: between(-.8, .8), next: 0, pulses: 2 + (rnd() * 3 | 0), k: between(.9, 1.1) });
    return true;
  }

  /* ---------- 지금 상태 → 각 소리의 크기 ---------- */
  function mood() {
    const s = S || { night: 0, sunAlt: 30, hour: 12, doy: 150, lon: 127, temp: 15, wind: 8, rain: 0, snow: 0, storm: 0, fog: 0, rh: 60, ice: 0, snowCover: 0 };
    const temp = s.temp == null ? 15 : s.temp, wind = s.wind == null ? 8 : s.wind;
    const wet = s.rain > 0 || s.storm > 0, dry = wet || s.snow > 0 ? 0 : 1;
    const day = clamp01((s.sunAlt + 8) / 10);                                     // 새는 해 뜨기 조금 전부터
    const dawn = s.hour < 12 ? Math.exp(-(((s.sunAlt - 4) / 9) ** 2)) : 0;
    const spring = .2 + .8 * Math.max(bump(s.doy, 135, 55), .75 * bump(s.doy, 205, 35), .45 * bump(s.doy, 280, 30));
    const birdWet = s.rain > 1 || s.storm ? 0 : s.rain > 0 || s.snow > 0 ? .3 : 1;
    const night = clamp01(s.night);
    return {
      wind: .035 + .45 * clamp01((wind - 4) / 40) ** .8,
      gusty: clamp01(wind / 30),
      whistle: .1 * clamp01((wind - 35) / 30),
      rain: s.rain ? Math.min(.7, .12 + .16 * s.rain) : 0,
      rainBright: s.rain > 1.5 ? 7000 : 4500,
      rumble: .3 * clamp01((s.rain - 1.5) / 2) + .08 * s.storm,
      drops: s.rain ? 60 * (5 + 7 * Math.min(2, s.rain)) : 0,                         // 분당
      dropVol: s.rain > 1.5 ? .5 : 1,
      river: (wet ? .2 : .13) * (1 - clamp01(s.ice)),
      muffle: s.snow > 0 ? 2600 : s.snowCover > .4 ? 6000 : s.fog ? 9000 : 16000,
      birds: 7 * day * spring * (1 + 2.5 * dawn) * birdWet * (1 - .6 * clamp01((wind - 25) / 20)),
      magpie: s.lon > 70 && s.lon < 150 ? 1.2 * day * birdWet * (1 - dawn * .5) : 0,
      crickets: night > .5 && temp >= 10 && !wet ? Math.round(4 * bump(s.doy, 250, 40) * clamp01((temp - 9) / 12) + .4) : 0,
      cricketRate: Math.max(30, 7.2 * temp - 32),                                    // 돌베어 법칙 (분당 울음 수)
      frogs: night > .3 && temp >= 13 ? 40 * bump(s.doy, 155, 28) * (.5 + clamp01(((s.rh || 60) - 60) / 30) + (wet ? .5 : 0)) * (s.storm ? 0 : 1) : 0,
      cicada: s.sunAlt > 8 && dry ? .05 * clamp01((temp - 23) / 5) * bump(s.doy, 210, 20) : 0,
      chime: dry && wind >= 5 ? 1.6 * clamp01((wind - 5) / 10) * (1 - clamp01((wind - 35) / 15)) : 0,
      storm: s.storm
    };
  }

  /* ---------- 하나씩 나는 소리 ---------- */
  function drop(at, v, p) {
    const s = ac.createBufferSource(); s.buffer = BUF.drops[rnd() * BUF.drops.length | 0]; s.playbackRate.value = between(.8, 1.3);
    const g = gain(v); chain(s, g, pan(p, muffle)); s.start(at);
  }
  function bird(at) {
    const p = between(-.85, .85), far = rnd(), v = .07 * (1 - far * .6);
    const o = ac.createOscillator(), g = gain(0); chain(o, g, filt("lowpass", 9500 - far * 4500), pan(p, muffle));
    const F = o.frequency, G = g.gain;
    let t = at;
    const note = (f0, f1, d, a = v) => {
      F.setValueAtTime(f0, t); F.exponentialRampToValueAtTime(f1, t + d);
      G.setValueAtTime(0, t); G.linearRampToValueAtTime(a, t + Math.min(.012, d * .3)); G.setValueAtTime(a, t + d * .7); G.linearRampToValueAtTime(0, t + d);
      t += d;
    };
    const kind = rnd();
    if (kind < .35) { const b = between(3000, 4200), n = 2 + (rnd() * 4 | 0); for (let i = 0; i < n; i++) { note(b, b * between(1.15, 1.35), between(.05, .08)); t += between(.05, .1); } }  // 짹짹
    else if (kind < .55) { const b = between(2400, 3200); note(b, b * 1.02, .18); t += .06; note(b * 1.3, b * 1.1, .26); }                                         // 휘-이
    else if (kind < .75) { const b = between(3800, 4800), n = 10 + (rnd() * 10 | 0); for (let i = 0; i < n; i++) note(i % 2 ? b : b * .9, i % 2 ? b * .9 : b, .028, v * .8); }  // 또르르
    else { const n = 4 + (rnd() * 4 | 0); for (let i = 0; i < n; i++) { const a = between(2300, 4500); note(a, a * between(.8, 1.25), between(.07, .14)); t += between(.01, .05); } }  // 지저귐
    o.start(at); o.stop(t + .05);
  }
  function magpie(at) {
    const o = ac.createOscillator(), g = gain(0); o.type = "square";
    chain(o, filt("bandpass", 1500, 1.8), g, filt("lowpass", 5000), pan(between(-.9, .9), muffle));
    let t = at; const n = 3 + (rnd() * 4 | 0), v = .03;
    for (let i = 0; i < n; i++) {
      o.frequency.setValueAtTime(between(620, 700), t); o.frequency.linearRampToValueAtTime(between(480, 540), t + .09);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.linearRampToValueAtTime(0, t + .1);
      t += between(.13, .17);
    }
    o.start(at); o.stop(t + .05);
  }
  function chirp(at, c) {                              // 귀뚤: 짧은 떨림 몇 번
    const o = ac.createOscillator(), g = gain(0); o.frequency.value = c.f;
    chain(o, g, pan(c.p, muffle));
    const v = .03;
    for (let i = 0; i < c.pulses; i++) {
      const t = at + i * .034;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .005); g.gain.setValueAtTime(v, t + .016); g.gain.linearRampToValueAtTime(0, t + .023);
    }
    o.start(at); o.stop(at + c.pulses * .034 + .03);
  }
  function croak(at) {                                 // 개굴: 빠른 떨림 묶음 두세 번
    const far = rnd(), v = .045 * (1 - far * .6);
    const o = ac.createOscillator(), g = gain(0); o.type = "sawtooth"; o.frequency.value = between(250, 380);
    chain(o, filt("bandpass", between(700, 1100), 2.5), g, filt("lowpass", 4000 - far * 2500), pan(between(-.9, .9), muffle));
    let t = at;
    for (let k = 0, n = 2 + (rnd() < .4); k < n; k++) {
      for (let i = 0, m = 5 + (rnd() * 4 | 0); i < m; i++) {
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.linearRampToValueAtTime(0, t + .022); t += .028;
      }
      t += between(.08, .16);
    }
    o.start(at); o.stop(t + .05);
  }
  function bell(at, f, v, p, dec, parts) {             // 금속 방울: 배음이 정수배가 아님
    const dest = pan(p, muffle);
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
    for (let i = 0, n = 1 + (rnd() * 3 | 0); i < n; i++) bell(at + i * between(.25, .8), f * between(.99, 1.01), .03 * between(.5, 1), p, 2.6, CHIME);
  }
  function cicadaPhrase(at, v) {
    L.cicadaLfo.frequency.setValueAtTime(between(5.5, 9), at);
    const d = between(4, 9), G = L.cicada.gain;
    G.setTargetAtTime(v, at, .5); G.setTargetAtTime(0, at + d, .7);
    return d + 2;
  }
  function burst(at, buf, type, f, v, dec, p) {        // 잡음 한 번 (불꽃 펑, 천둥 '쾅')
    const s = ac.createBufferSource(); s.buffer = buf;
    const g = gain(0); chain(s, filt(type, f, .7), g, pan(p, muffle));
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + .008); g.gain.exponentialRampToValueAtTime(.0001, at + dec);
    s.start(at, rnd() * 3); s.stop(at + dec + .05);
  }

  /* ---------- 시간 맞춰 내보내기 ---------- */
  function poisson(name, perMin, horizon, fn) {        // 분당 perMin 번꼴로 무작위
    const now = ac.currentTime;
    if (!(perMin > 0)) { next[name] = 0; return; }
    if (!next[name] || next[name] < now - .5) next[name] = now + -Math.log(1 - rnd()) * 60 / perMin;
    while (next[name] < now + horizon) {
      const gap = fn(Math.max(now, next[name])) || 0;
      next[name] += gap + -Math.log(1 - rnd()) * 60 / perMin;
    }
  }
  function tick() {
    if (!ac || ac.state !== "running") return;
    const now = ac.currentTime, M = mood(), horizon = document.hidden ? 1.3 : .3;
    // 돌풍: 몇 초마다 목표가 바뀌고 천천히 따라감
    if (now > gustAt) { gustTo = between(.35, 1.5); gustAt = now + between(2, 7); }
    gust += (gustTo - gust) * (document.hidden ? .3 : .06);
    const gw = 1 - M.gusty * .55 + M.gusty * .55 * gust;
    ease(L.wind.gain, M.wind * gw, .25);
    ease(L.windF.frequency, 220 + 900 * gust * (.35 + M.gusty), .25);
    ease(L.whistle.gain, M.whistle * gust * gust, .25);
    ease(L.whistleF.frequency, 650 + 500 * gust, .3);
    ease(L.rain.gain, M.rain, 2); ease(L.rainF.frequency, M.rainBright, 2); ease(L.rumble.gain, M.rumble, 2);
    ease(L.river.gain, M.river, 2);
    ease(muffle.frequency, M.muffle, 3);
    for (const b of L.brook) if (rnd() < .3) { b.f.frequency.setTargetAtTime(between(350, 1500), now, .03); b.g.gain.setTargetAtTime(between(.1, 1), now, .04); }
    if (!M.cicada) ease(L.cicada.gain, 0, .8);
    // 하나씩 나는 소리
    poisson("drop", M.drops, horizon, at => drop(at, between(.01, .05) * M.dropVol, between(-.9, .9)));
    poisson("bird", M.birds, horizon, at => { bird(at); });
    poisson("magpie", M.magpie, horizon, at => { magpie(at); });
    poisson("frog", M.frogs, horizon, at => { croak(at); });
    poisson("chime", M.chime * gust, horizon, at => { chime(at); });
    poisson("cicada", M.cicada ? 5 : 0, horizon, at => cicadaPhrase(at, M.cicada));
    poisson("thunder", M.storm && document.hidden ? 2 : 0, horizon, () => { thunder(between(-.6, .6)); });   // 화면을 안 볼 땐 스스로
    crickets.forEach((c, i) => {                        // 풀벌레는 저마다 일정한 빠르기로
      if (i >= M.crickets) { c.next = 0; return; }
      const period = 60 / (M.cricketRate * c.k);
      if (!c.next || c.next < now - .5) c.next = now + rnd() * period;
      while (c.next < now + horizon) { chirp(c.next, c); c.next += period * between(.94, 1.06); }
    });
    if (bellsUntil > now) poisson("jingle", 240, horizon, at => {   // 썰매 방울: 왼쪽에서 오른쪽으로 지나감
      const p = -.8 + 1.6 * clamp01((at - bellsFrom) / (bellsUntil - bellsFrom));
      for (let i = 0, n = 2 + (rnd() * 4 | 0); i < n; i++) bell(at + i * .018, between(3200, 4600), .012, p, .35, JINGLE);
    });
  }

  /* ---------- 켜고 끄기 ---------- */
  function start() {
    if (!ac && !build()) return;
    const r = ac.resume();
    const go = () => {
      if (!pref.on) return;
      if (ac.state !== "running") { arm(); return; }
      ease(out.gain, level(), .8);
      clearInterval(timer); timer = setInterval(tick, 100); tick();
    };
    if (r && r.then) r.then(go, go); else go();
  }
  function stop() {
    clearInterval(timer); timer = 0;
    if (!ac) return;
    ease(out.gain, 0, .12);
    L.cicada.gain.cancelScheduledValues(ac.currentTime); L.cicada.gain.value = 0;
    for (const k in next) next[k] = 0;
    crickets.forEach(c => { c.next = 0; });
    setTimeout(() => { if (!pref.on && ac.state === "running") ac.suspend(); }, 800);
  }
  function arm() {                                     // 브라우저는 사용자가 한 번 누른 뒤에야 소리를 냄
    if (armed) return;
    armed = true;
    const go = () => { armed = false; removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true); if (pref.on) start(); };
    addEventListener("pointerdown", go, true); addEventListener("keydown", go, true);
  }

  function thunder(p = 0) {
    if (!ac || !pref.on || ac.state !== "running") return;
    const dist = rnd(), at = ac.currentTime + .4 + dist * 5, v = .85 - dist * .55;
    const s = ac.createBufferSource(); s.buffer = BUF.brown;
    const lp = filt("lowpass", 1500, .7), g = gain(0); chain(s, lp, g, pan(p * .7, muffle));
    lp.frequency.setValueAtTime(1700 - dist * 1200, at); lp.frequency.exponentialRampToValueAtTime(140, at + 2.5);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + .05 + dist * .4);
    let t = at + .3 + dist * .4;
    for (let i = 0; i < 4; i++) { t += between(.4, 1.1); g.gain.linearRampToValueAtTime(v * between(.35, .8) * (1 - i * .15), t); }   // 우르릉
    g.gain.setTargetAtTime(0, t, .9);
    s.start(at, rnd() * 2); s.stop(t + 5);
    if (dist < .35) burst(at, BUF.white, "highpass", 1200, .35 * (1 - dist * 2), .3, p * .7);         // 가까우면 찢어지는 소리
  }

  window.PlannerAmbient = {
    isOn: () => pref.on,
    volume: () => pref.vol,
    setOn(v) { pref.on = !!v; save(); if (pref.on) start(); else stop(); emit(); },
    setVolume(v) { pref.vol = Math.max(0, Math.min(1, +v || 0)); save(); if (ac && pref.on) ease(out.gain, level(), .1); },
    update(state) { S = state; },
    thunder,
    pop(p = 0) {                                       // 불꽃: 조금 늦게 펑 + 타닥타닥
      if (!ac || !pref.on || ac.state !== "running") return;
      const at = ac.currentTime + between(.6, 1.6);
      burst(at, BUF.brown, "lowpass", 320, .5, .7, p);
      for (let i = 0; i < 14; i++) burst(at + .25 + rnd() * .8, BUF.white, "highpass", 3000, .05 * rnd(), .03, p + between(-.2, .2));
    },
    bells(sec = 16) { if (!ac || !pref.on) return; bellsFrom = ac.currentTime; bellsUntil = bellsFrom + sec; }
  };
  if (["localhost", "127.0.0.1"].includes(location.hostname)) window.PlannerAmbient._probe = () => ({ ac, out, S, M: ac && mood() });   // 로컬 점검용
  if (pref.on) arm();
})();
