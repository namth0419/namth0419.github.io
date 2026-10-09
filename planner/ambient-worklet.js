/*
 * 배경 소리의 소리 발생기 (오디오 스레드에서 돎, ambient.js 가 불러 씀)
 *   amb-noise:   잡음을 되풀이 없이 계속 새로 만듦 (채널마다 따로). kind: white · pink · brown
 *   amb-patter:  아주 짧은 '톡'이 무작위로 (초당 rate 개). 크기는 대부분 작고 가끔 큼 → 빗방울이 잎·땅을 두드리는 소리, 바람에 잎이 스치는 소리
 *   amb-bubbles: 물속 작은 공기방울의 '퐁' 울림 (Minnaert 공명, 울리는 동안 높이가 살짝 올라감 — van den Doel 2005)
 *                → 수백 개가 겹치면 졸졸 흐르는 물, 드문드문이면 웅덩이에 떨어지는 빗방울
 */
const SR = sampleRate;

class Noise extends AudioWorkletProcessor {
  constructor(o) {
    super();
    this.kind = (o.processorOptions && o.processorOptions.kind) || "white";
    this.st = [];
  }
  process(_, outputs) {
    const out = outputs[0];
    for (let c = 0; c < out.length; c++) {
      const d = out[c], s = this.st[c] || (this.st[c] = { b: [0, 0, 0, 0, 0, 0, 0], last: 0 }), b = s.b;
      for (let i = 0; i < d.length; i++) {
        const x = Math.random() * 2 - 1;
        if (this.kind === "pink") {                    // Paul Kellet 의 분홍 잡음 필터
          b[0] = .99886 * b[0] + x * .0555179; b[1] = .99332 * b[1] + x * .0750759; b[2] = .969 * b[2] + x * .153852;
          b[3] = .8665 * b[3] + x * .3104856; b[4] = .55 * b[4] + x * .5329522; b[5] = -.7616 * b[5] - x * .016898;
          d[i] = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + x * .5362) * .11; b[6] = x * .115926;
        } else if (this.kind === "brown") { s.last = (s.last + .02 * x) / 1.02; d[i] = s.last * 3.5; }
        else d[i] = x;
      }
    }
    return true;
  }
}
registerProcessor("amb-noise", Noise);

class Patter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "rate", defaultValue: 0, minValue: -1e5, maxValue: 1e5, automationRate: "k-rate" },
            { name: "decay", defaultValue: .0015, minValue: .0001, maxValue: .05, automationRate: "k-rate" }];
  }
  constructor() { super(); this.env = []; }
  process(_, outputs, P) {
    const out = outputs[0], p = Math.min(1, Math.max(0, P.rate[0]) / SR), k = Math.exp(-1 / (P.decay[0] * SR));
    for (let c = 0; c < out.length; c++) {
      const d = out[c];
      let e = this.env[c] || 0;
      for (let i = 0; i < d.length; i++) {
        if (Math.random() < p) { const u = Math.random(); e += u * u * u * u; }
        e *= k; d[i] = e * (Math.random() * 2 - 1);
      }
      this.env[c] = e;
    }
    return true;
  }
}
registerProcessor("amb-patter", Patter);

class Bubbles extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "rate", defaultValue: 0, minValue: 0, maxValue: 5000, automationRate: "k-rate" },
            { name: "fmin", defaultValue: 400, minValue: 50, maxValue: 8000, automationRate: "k-rate" },
            { name: "fmax", defaultValue: 1600, minValue: 50, maxValue: 12000, automationRate: "k-rate" }];
  }
  constructor() { super(); this.b = []; }
  process(_, outputs, P) {
    const out = outputs[0], Lc = out[0], Rc = out[1] || out[0], n = Lc.length;
    Lc.fill(0); if (Rc !== Lc) Rc.fill(0);
    const p = P.rate[0] / SR, f1 = P.fmin[0], f2 = Math.max(f1 + 1, P.fmax[0]);
    for (let i = 0; i < n; i++) {
      if (this.b.length < 128 && Math.random() < p) {
        const f = f1 * Math.pow(f2 / f1, Math.random()), tau = (6 + 14 * Math.random()) / f;   // 작은 방울일수록 높고 짧게
        const u = Math.random(), pan = Math.random();
        this.b.push({ at: i, ph: 0, f, df: f * (.2 + .8 * Math.random()) / (tau * 3 * SR), a: (.15 + .85 * u * u) * Math.pow(f1 / f, .35),
                      k: Math.exp(-1 / (tau * SR)), gl: Math.sqrt(1 - pan), gr: Math.sqrt(pan) });
      }
    }
    const w = 2 * Math.PI / SR;
    this.b = this.b.filter(B => {
      for (let j = B.at; j < n; j++) {
        B.ph += w * B.f; B.f += B.df;
        const v = B.a * Math.sin(B.ph);
        Lc[j] += v * B.gl; if (Rc !== Lc) Rc[j] += v * B.gr;
        B.a *= B.k;
      }
      B.at = 0;
      return B.a > 1e-4;
    });
    return true;
  }
}
registerProcessor("amb-bubbles", Bubbles);
