/*
 * 배경 소리 (켜면 계절 풍경과 같은 날씨·시각·계절로 그 자리에서 만들어 냄. 음원 파일 없이 Web Audio 로 합성)
 * 잡음·빗방울·물방울은 ambient-worklet.js 가 오디오 스레드에서 계속 새로 만들어서 되풀이(루프)가 없음.
 *   바람:   잎이 스치는 소리 + 낮은 웅웅거림 + 휘익 지나가는 소리. 세기·높이는 풍속(km/h)으로,
 *           돌풍은 서로 맞지 않는 아주 느린 사인파 넷을 더한 매끄러운 흔들림 (주기도 조금씩 바뀌어 되풀이되지 않음)
 *           센 돌풍일 때만 휘파람 소리. 겨울엔 잎이 적어 스치는 소리가 줄어듦
 *   비:     빗방울 수천 개가 잎·땅을 두드리는 소리(세기만큼 많고 빠르게) + 쏴아 바탕 + 웅덩이에 '퐁'. 굵은 비는 낮은 울림까지
 *   천둥:   화면에 번개가 치면 거리만큼 늦게 (소리는 1 km 에 약 3초). 멀수록 작고 낮게 우르릉
 *   눈:     쌓인 눈이 소리를 빨아들여 높은 소리가 줄어듦 (전체에 저역 통과). 안개도 조금
 *   강물:   수백 개 물방울 공명이 겹친 졸졸 소리. 강이 얼어 가면 그만큼 작아지고 다 얼면 멈춤. 비가 오면 조금 불어남
 *   새:     해 뜨기 조금 전부터 해 질 때까지. 해 뜰 무렵이 가장 많고(새벽 합창) 봄·여름에 많음. 비 오면 조용
 *   까치:   동아시아에서 낮에 가끔 깍깍
 *   풀벌레: 늦여름~가을 밤. 우는 빠르기는 기온으로 정함 (돌베어 법칙: 분당 7.2 × 기온(°C) − 32 번)
 *   개구리: 늦봄~초여름 밤(무논), 습할수록 많이
 *   매미:   한여름 더운 낮
 *   풍경:   바람이 적당할 때 처마 끝 풍경이 가끔 댕그랑
 *   기념일: 설날 불꽃놀이 펑, 크리스마스 썰매 방울
 *   공간:   새·벌레·천둥 같은 소리엔 바깥 공기의 옅은 울림(잔향)을 더함
 * 켜고 끄기·크기는 이 브라우저에만 저장. 브라우저는 사용자가 한 번 누른 뒤에야 소리를 내게 해서, 켜 둔 채 다시 열면 첫 클릭에 시작.
 */
(function () {
  "use strict";
  const KEY = "planner-sound", WORKLET = "ambient-worklet.js?v=38";
  const pref = { on: false, vol: .6 };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {} };
  const emit = () => dispatchEvent(new CustomEvent("planner:sound"));
  const rnd = Math.random, between = (a, b) => a + rnd() * (b - a);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const bump = (doy, c, wd) => { const x = Math.abs(doy - c), d = Math.min(x, 365 - x); return Math.exp(-((d / wd) ** 2)); };

  let ac = null, ready = null, out, muffle, verb, L = {}, BUF = {}, S = null, timer = 0, armed = false;
  let bellsFrom = 0, bellsUntil = 0, wanderAt = 0;
  const next = {}, crickets = [];
  const level = () => pref.vol * pref.vol * 4;            // 귀에 들리는 크기는 대략 제곱으로

  /* ---------- 그래프 도구 ---------- */
  const gain = (v = 0) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, Q = .7) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = Q; return x; };
  const chain = (...n) => { for (let i = 1; i < n.length; i++) n[i - 1].connect(n[i]); return n[n.length - 1]; };
  const ease = (param, v, tc = 1.2) => param.setTargetAtTime(v, ac.currentTime, tc);
  const node = (name, opt = {}) => new AudioWorkletNode(ac, name, { numberOfInputs: 0, outputChannelCount: [2], ...opt });
  const noise = kind => node("amb-noise", { processorOptions: { kind } });
  function pan(x, dest) {
    if (!ac.createStereoPanner) return dest;
    const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x)); p.connect(dest); return p;
  }
  function wet(amount) {                               // 마른 소리 + 잔향을 함께 보내는 입구
    const g = gain(1); g.connect(muffle);
    if (amount > 0) chain(g, gain(amount), verb);
    return g;
  }
  function oneShotBuf(kind, sec = 6) {                 // 천둥·불꽃처럼 한 번 나는 소리용 잡음 (반복 재생하지 않음)
    const n = Math.round(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const x = rnd() * 2 - 1; if (kind === "brown") { last = (last + .02 * x) / 1.02; d[i] = last * 3.5; } else d[i] = x; }
    return b;
  }
  function outdoorVerb(sec = 1.6) {                    // 바깥 공기의 잔향: 촘촘한 잡음이 빨리 사그라들고 끝으로 갈수록 어두워짐
    const sr = ac.sampleRate, n = Math.round(sr * sec), pre = Math.round(sr * .018), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let y = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr, k = .55 * Math.exp(-t / .5) + .05;
        y += ((rnd() * 2 - 1) - y) * k;
        d[i] = y * Math.exp(-t / .38);
      }
    }
    const v = ac.createConvolver(); v.buffer = b; return v;
  }

  /* ---------- 그래프 만들기 ---------- */
  async function build() {
    await ac.audioWorklet.addModule(WORKLET);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = .01; comp.release.value = .4;
    comp.connect(ac.destination);
    out = gain(0); out.connect(comp);
    muffle = filt("lowpass", 16000, .5); muffle.connect(out);
    verb = outdoorVerb(); chain(verb, gain(.6), muffle);
    BUF.white = oneShotBuf("white"); BUF.brown = oneShotBuf("brown");

    // 돌풍 신호 (-1~1): 아주 느린 사인파 넷. 두 벌(A, B)을 다르게 섞어 왼쪽·오른쪽 바람이 따로 출렁임
    L.ctlA = gain(1); L.ctlB = gain(1); L.lfos = [];
    [[.029, .38, .2], [.071, .3, -.35], [.15, .2, .3], [.31, .12, -.15]].forEach(([f, a, b]) => {
      const o = ac.createOscillator(); o.frequency.value = f * between(.85, 1.15); o.base = f;
      chain(o, gain(a), L.ctlA); chain(o, gain(b), L.ctlB); o.start();
      L.lfos.push(o);
    });
    L.squall = ac.createWaveShaper();                  // 센 돌풍만 남김: 0 아래는 0, 위로 갈수록 가파르게
    L.squall.curve = Float32Array.from({ length: 257 }, (_, i) => { const x = i / 128 - 1; return Math.max(0, (x - .2) / .8) ** 2; });
    L.ctlA.connect(L.squall);

    // 바람이 지나가는 소리: 분홍 잡음의 넓은 대역, 세기와 높이가 돌풍 따라 출렁임 (왼쪽 A · 오른쪽 B)
    L.bodies = [[L.ctlA, -.6], [L.ctlB, .6]].map(([ctl, p]) => {
      const bp = filt("bandpass", 400, .7), g = gain(0), fDepth = gain(0), aDepth = gain(0);
      chain(noise("pink"), bp, filt("lowpass", 1800, .5), g, pan(p, muffle));
      chain(ctl, fDepth, bp.frequency); chain(ctl, aDepth, g.gain);
      return { bp, g, fDepth, aDepth };
    });
    // 낮은 웅웅거림
    L.rumble = gain(0); L.rumbleDepth = gain(0);
    chain(noise("brown"), filt("lowpass", 160, .6), L.rumble, muffle); chain(L.ctlB, L.rumbleDepth, L.rumble.gain);
    // 잎이 스치는 소리: 잎끼리 부딪는 아주 작은 '톡' 수천 개. 돌풍이 세지면 더 많이
    L.rustle = node("amb-patter"); L.rustle.parameters.get("decay").value = .0025;
    L.rustleG = gain(0); L.rustleDepth = gain(0); L.rustleSq = gain(0);
    chain(L.rustle, filt("highpass", 900, .5), filt("lowpass", 6500, .5), L.rustleG, muffle);
    chain(L.ctlA, L.rustleDepth, L.rustle.parameters.get("rate"));
    chain(L.squall, L.rustleSq, L.rustleG.gain);
    // 휘파람: 센 돌풍에만
    L.whistle = gain(0);
    const wf = filt("bandpass", 850, 14); chain(L.ctlB, gain(220), wf.frequency);
    chain(noise("white"), wf, L.whistle, pan(.2, muffle)); L.whistleDepth = gain(0); chain(L.squall, L.whistleDepth, L.whistle.gain);

    // 비: 두드리는 빗방울 + 쏴아 바탕 + 웅덩이 '퐁' + 굵은 비의 울림
    L.rainTap = node("amb-patter"); L.rainTap.parameters.get("decay").value = .0011;
    L.rainTapG = gain(0); chain(L.rainTap, filt("highpass", 700, .5), filt("lowpass", 8000, .5), L.rainTapG, muffle);
    L.rainBedF = filt("lowpass", 4000, .5); L.rainBed = gain(0);
    chain(noise("pink"), filt("highpass", 350, .5), L.rainBedF, L.rainBed, muffle);
    L.plink = node("amb-bubbles"); L.plink.parameters.get("fmin").value = 1300; L.plink.parameters.get("fmax").value = 3800;
    L.plinkG = gain(0); chain(L.plink, L.plinkG, wet(.25));
    L.heavy = gain(0); chain(noise("brown"), filt("lowpass", 220, .6), L.heavy, muffle);

    // 강물: 물방울 공명 수백 개 + 낮은 흐름
    L.brook = node("amb-bubbles"); L.brook.parameters.get("fmin").value = 320; L.brook.parameters.get("fmax").value = 1500;
    L.river = gain(0); chain(L.brook, filt("highpass", 180, .5), L.river, wet(.15));
    L.flow = gain(0); chain(noise("pink"), filt("lowpass", 500, .5), L.flow, muffle);

    // 매미: 높은 대역 잡음을 '맴맴' 빠르기로 흔듦
    L.cicada = gain(0); L.cicadaAm = gain(.5); L.cicadaLfo = ac.createOscillator(); L.cicadaLfo.frequency.value = 7;
    chain(L.cicadaLfo, gain(.5), L.cicadaAm.gain); L.cicadaLfo.start();
    chain(noise("white"), filt("bandpass", 5200, 4), L.cicadaAm, L.cicada, pan(.3, wet(.2)));

    // 새소리 음색: 기본음에 배음이 아주 조금
    L.birdWave = ac.createPeriodicWave(new Float32Array([0, 1, .12, .04]), new Float32Array(4));
    L.dry = wet(0); L.birdBus = wet(.35); L.bugBus = wet(.18); L.bellBus = wet(.4); L.boomBus = wet(.5);
    for (let i = 0; i < 4; i++) crickets.push({ f: between(3900, 4900), p: between(-.8, .8), next: 0, pulses: 2 + (rnd() * 3 | 0), k: between(.9, 1.1) });
    L.ok = true;
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
    const night = clamp01(s.night), wn = clamp01((wind - 2) / 45), rain = s.rain || 0;
    return {
      wn, gusty: .35 + .5 * clamp01(wind / 30),
      wind: .019 + .225 * wn ** .9,
      rumble: .25 * wn ** 1.5,
      leaves: 1 - .7 * bump(s.doy, 30, 45),                                       // 겨울엔 잎이 적음 (늘푸른 나무만)
      whistle: .05 * clamp01((wind - 30) / 30),
      rainTap: rain ? .075 : 0, rainRate: rain ? 400 + 2600 * rain : 0,                   // 많이 올수록 빗방울 수가 늘어 저절로 커짐
      rainBed: rain ? Math.min(.28, .024 + .072 * rain) : 0, rainBright: rain > 1.5 ? 6500 : 3500,
      plink: rain ? (rain > 2 ? .05 : .12) : 0, plinkRate: rain ? 6 + 10 * Math.min(2, rain) : 0,
      heavy: .075 * clamp01((rain - 1.5) / 2) + .02 * s.storm,
      river: (wet ? 1.3 : 1) * (1 - clamp01(s.ice)),
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
  function setBeds(M, tc) {                             // 계속 나는 소리들의 크기 (천천히 바뀜)
    for (const b of L.bodies) {
      ease(b.g.gain, M.wind, tc); ease(b.aDepth.gain, M.wind * M.gusty, tc);
      ease(b.bp.frequency, 260 + 520 * M.wn, tc); ease(b.fDepth.gain, 120 + 380 * M.wn, tc);
    }
    ease(L.rumble.gain, M.rumble, tc); ease(L.rumbleDepth.gain, M.rumble * .7, tc);
    const rr = M.leaves * (60 + 2600 * M.wn);                                       // 잎 스침: 초당 '톡' 수
    ease(L.rustle.parameters.get("rate"), rr, tc); ease(L.rustleDepth.gain, rr * .8, tc);
    ease(L.rustleG.gain, M.leaves * (.022 + .06 * M.wn), tc); ease(L.rustleSq.gain, M.leaves * .06 * M.wn, tc);
    ease(L.whistleDepth.gain, M.whistle, tc);
    ease(L.rainTap.parameters.get("rate"), M.rainRate, tc); ease(L.rainTapG.gain, M.rainTap, tc);
    ease(L.rainBed.gain, M.rainBed, tc); ease(L.rainBedF.frequency, M.rainBright, tc);
    ease(L.plink.parameters.get("rate"), M.plinkRate, tc); ease(L.plinkG.gain, M.plink, tc);
    ease(L.heavy.gain, M.heavy, tc);
    ease(L.brook.parameters.get("rate"), M.river > 0 ? 260 * M.river : 0, tc);
    ease(L.river.gain, .018 * M.river, tc); ease(L.flow.gain, .03 * M.river, tc);
    ease(muffle.frequency, M.muffle, tc);
    if (!M.cicada) ease(L.cicada.gain, 0, .8);
  }

  /* ---------- 하나씩 나는 소리 ---------- */
  function bird(at) {
    const p = between(-.85, .85), far = rnd(), v = .07 * (1 - far * .6);
    const o = ac.createOscillator(), g = gain(0); o.setPeriodicWave(L.birdWave);
    chain(o, g, filt("lowpass", 9500 - far * 4500), pan(p, L.birdBus));
    if (rnd() < .5) {                                  // 떨림 (빠른 비브라토)
      const fm = ac.createOscillator(); fm.frequency.value = between(25, 60);
      chain(fm, gain(between(40, 160)), o.frequency); fm.start(at); fm.stop(at + 3);
    }
    const F = o.frequency, G = g.gain;
    let t = at;
    const note = (f0, f1, d, a = v) => {
      F.setValueAtTime(f0, t); F.exponentialRampToValueAtTime(f1, t + d);
      G.setValueAtTime(0, t); G.linearRampToValueAtTime(a, t + Math.min(.015, d * .3)); G.setTargetAtTime(0, t + d * .6, d * .15);
      t += d;
    };
    const kind = rnd();
    if (kind < .35) { const b = between(3000, 4200), n = 2 + (rnd() * 4 | 0); for (let i = 0; i < n; i++) { note(b, b * between(1.15, 1.35), between(.05, .08)); t += between(.05, .1); } }  // 짹짹
    else if (kind < .55) { const b = between(2400, 3200); note(b, b * 1.02, .18); t += .06; note(b * 1.3, b * 1.1, .26); }                                         // 휘-이
    else if (kind < .75) { const b = between(3800, 4800), n = 10 + (rnd() * 10 | 0); for (let i = 0; i < n; i++) note(i % 2 ? b : b * .9, i % 2 ? b * .9 : b, .028, v * .8); }  // 또르르
    else { const n = 4 + (rnd() * 4 | 0); for (let i = 0; i < n; i++) { const a = between(2300, 4500); note(a, a * between(.8, 1.25), between(.07, .14)); t += between(.01, .05); } }  // 지저귐
    o.start(at); o.stop(t + .3);
  }
  function magpie(at) {
    const o = ac.createOscillator(), g = gain(0); o.type = "square";
    chain(o, filt("bandpass", 1500, 1.8), g, filt("lowpass", 5000), pan(between(-.9, .9), L.birdBus));
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
    chain(o, g, pan(c.p, L.bugBus));
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
    chain(o, filt("bandpass", between(700, 1100), 2.5), g, filt("lowpass", 4000 - far * 2500), pan(between(-.9, .9), L.bugBus));
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
    const dest = pan(p, L.bellBus);
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
  function burst(at, buf, type, f, v, dec, p, bus) {   // 잡음 한 번 (불꽃 펑, 천둥 '쾅')
    const s = ac.createBufferSource(); s.buffer = buf;
    const g = gain(0); chain(s, filt(type, f, .7), g, pan(p, bus || L.boomBus));
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
    if (!L.ok || ac.state !== "running") return;
    const now = ac.currentTime, M = mood(), horizon = document.hidden ? 1.3 : .3;
    setBeds(M, 3);
    if (now > wanderAt) {                              // 돌풍 사인파의 빠르기도 천천히 바뀌어 같은 무늬가 되풀이되지 않음
      wanderAt = now + between(6, 14);
      for (const o of L.lfos) o.frequency.setTargetAtTime(o.base * between(.7, 1.35), now, 5);
    }
    poisson("bird", M.birds, horizon, at => { bird(at); });
    poisson("magpie", M.magpie, horizon, at => { magpie(at); });
    poisson("frog", M.frogs, horizon, at => { croak(at); });
    poisson("chime", M.chime, horizon, at => { chime(at); });
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
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // iPhone 무음 스위치와 상관없이
      ac = new AC();
      if (!ac.audioWorklet) { ac = null; return; }
      ready = build().catch(e => { console.warn("배경 소리를 준비하지 못했습니다", e); });
    }
    const r = ac.resume();                             // 누른 그 순간에 불러야 소리가 남 (특히 Safari)
    const go = () => {
      if (!pref.on || !L.ok) return;
      if (ac.state !== "running") { arm(); return; }
      setBeds(mood(), .05);
      ease(out.gain, level(), .8);
      clearInterval(timer); timer = setInterval(tick, 100); tick();
    };
    Promise.all([r, ready]).then(go, go);
  }
  function stop() {
    clearInterval(timer); timer = 0;
    if (!ac || !L.ok) return;
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
  const live = () => ac && L.ok && pref.on && ac.state === "running";

  function thunder(p = 0) {
    if (!live()) return;
    const dist = rnd(), at = ac.currentTime + .4 + dist * 5, v = .85 - dist * .55;
    const s = ac.createBufferSource(); s.buffer = BUF.brown;
    const lp = filt("lowpass", 1500, .7), g = gain(0); chain(s, lp, g, pan(p * .7, L.boomBus));
    lp.frequency.setValueAtTime(1700 - dist * 1200, at); lp.frequency.exponentialRampToValueAtTime(140, at + 2.5);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + .05 + dist * .4);
    let t = at + .3 + dist * .4;
    for (let i = 0; i < 4; i++) { t += between(.4, 1.1); g.gain.linearRampToValueAtTime(v * between(.35, .8) * (1 - i * .15), t); }   // 우르릉
    g.gain.setTargetAtTime(0, t, .9);
    s.start(at, rnd() * 1.5); s.stop(t + 4);
    if (dist < .35) burst(at, BUF.white, "highpass", 1200, .35 * (1 - dist * 2), .3, p * .7);         // 가까우면 찢어지는 소리
  }

  window.PlannerAmbient = {
    isOn: () => pref.on,
    volume: () => pref.vol,
    setOn(v) { pref.on = !!v; save(); if (pref.on) start(); else stop(); emit(); },
    setVolume(v) { pref.vol = Math.max(0, Math.min(1, +v || 0)); save(); if (live()) ease(out.gain, level(), .1); },
    update(state) { S = state; },
    thunder,
    pop(p = 0) {                                       // 불꽃: 조금 늦게 펑 + 타닥타닥
      if (!live()) return;
      const at = ac.currentTime + between(.6, 1.6);
      burst(at, BUF.brown, "lowpass", 320, .5, .7, p);
      for (let i = 0; i < 14; i++) burst(at + .25 + rnd() * .8, BUF.white, "highpass", 3000, .05 * rnd(), .03, p + between(-.2, .2), L.dry);
    },
    bells(sec = 16) { if (!live()) return; bellsFrom = ac.currentTime; bellsUntil = bellsFrom + sec; }
  };
  if (["localhost", "127.0.0.1"].includes(location.hostname)) window.PlannerAmbient._probe = () => ({ ac, out, L, S, M: L.ok && mood() });   // 로컬 점검용
  if (pref.on) arm();
})();
