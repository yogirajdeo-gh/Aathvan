// Marathi speech-to-text that runs on the phone, using AI4Bharat's
// IndicConformer model (ONNX). This file prepares the audio (log-mel
// features, NeMo style) and turns the model's output into text.
// Works in the browser and in Node (for tests).
(function (root) {
  "use strict";

  const SR = 16000, N_FFT = 512, WIN = 400, HOP = 160, N_MELS = 80, PREEMPH = 0.97;
  const LOG_GUARD = Math.pow(2, -24);

  // ---- mel filterbank (librosa "slaney" scale and norm) ----
  const hzToMel = (f) => (f < 1000 ? f / (200 / 3) : 15 + Math.log(f / 1000) / (Math.log(6.4) / 27));
  const melToHz = (m) => (m < 15 ? m * (200 / 3) : 1000 * Math.exp((Math.log(6.4) / 27) * (m - 15)));

  const FB = (() => {
    const bins = N_FFT / 2 + 1;
    const fftFreqs = Array.from({ length: bins }, (_, i) => (i * SR) / N_FFT);
    const mMin = hzToMel(0), mMax = hzToMel(SR / 2);
    const hz = Array.from({ length: N_MELS + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (N_MELS + 1)));
    const fb = [];
    for (let m = 0; m < N_MELS; m++) {
      const row = new Float32Array(bins);
      const lo = hz[m], mid = hz[m + 1], hi = hz[m + 2];
      const enorm = 2 / (hi - lo);
      for (let k = 0; k < bins; k++) {
        const f = fftFreqs[k];
        const up = (f - lo) / (mid - lo), down = (hi - f) / (hi - mid);
        row[k] = Math.max(0, Math.min(up, down)) * enorm;
      }
      fb.push(row);
    }
    return fb;
  })();

  // Symmetric Hann window of 400 samples, centred inside the 512-point frame.
  const WINDOW = (() => {
    const w = new Float32Array(N_FFT);
    const off = (N_FFT - WIN) / 2;
    for (let i = 0; i < WIN; i++) w[off + i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));
    return w;
  })();

  // ---- radix-2 FFT (in place) ----
  const REV = (() => {
    const r = new Uint16Array(N_FFT), bits = Math.log2(N_FFT);
    for (let i = 0; i < N_FFT; i++) { let x = i, y = 0; for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; } r[i] = y; }
    return r;
  })();
  const COS = new Float32Array(N_FFT / 2), SIN = new Float32Array(N_FFT / 2);
  for (let i = 0; i < N_FFT / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / N_FFT); SIN[i] = -Math.sin((2 * Math.PI * i) / N_FFT); }

  function fft(re, im) {
    for (let i = 0; i < N_FFT; i++) { const j = REV[i]; if (j > i) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let size = 2; size <= N_FFT; size <<= 1) {
      const half = size >> 1, step = N_FFT / size;
      for (let start = 0; start < N_FFT; start += size) {
        for (let k = 0; k < half; k++) {
          const c = COS[k * step], s = SIN[k * step];
          const a = start + k, b = a + half;
          const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  /** 16 kHz mono samples -> { data: Float32Array [80 x frames], frames } */
  function features(samples) {
    const n = samples.length;
    const x = new Float32Array(n);
    x[0] = samples[0] || 0;
    for (let i = 1; i < n; i++) x[i] = samples[i] - PREEMPH * samples[i - 1];

    const pad = N_FFT / 2;
    const frames = Math.floor(n / HOP) + 1;
    const bins = N_FFT / 2 + 1;
    const out = new Float32Array(N_MELS * frames);
    const re = new Float32Array(N_FFT), im = new Float32Array(N_FFT), power = new Float32Array(bins);

    for (let t = 0; t < frames; t++) {
      const start = t * HOP - pad;
      for (let i = 0; i < N_FFT; i++) {
        const j = start + i;
        re[i] = j >= 0 && j < n ? x[j] * WINDOW[i] : 0;
        im[i] = 0;
      }
      fft(re, im);
      for (let k = 0; k < bins; k++) power[k] = re[k] * re[k] + im[k] * im[k];
      for (let m = 0; m < N_MELS; m++) {
        const row = FB[m];
        let s = 0;
        for (let k = 0; k < bins; k++) s += row[k] * power[k];
        out[m * frames + t] = Math.log(s + LOG_GUARD);
      }
    }

    // Normalise each mel band to zero mean and unit variance.
    for (let m = 0; m < N_MELS; m++) {
      let mean = 0;
      for (let t = 0; t < frames; t++) mean += out[m * frames + t];
      mean /= frames;
      let v = 0;
      for (let t = 0; t < frames; t++) { const d = out[m * frames + t] - mean; v += d * d; }
      const std = Math.sqrt(v / Math.max(frames - 1, 1)) + 1e-5;
      for (let t = 0; t < frames; t++) out[m * frames + t] = (out[m * frames + t] - mean) / std;
    }
    return { data: out, frames };
  }

  /** Greedy CTC decoding of log_probs [T x V] into text. */
  function decode(logProbs, T, V, vocab, blank) {
    let prev = -1;
    const pieces = [];
    for (let t = 0; t < T; t++) {
      let best = 0, bestV = -Infinity;
      const base = t * V;
      for (let v = 0; v < V; v++) { const p = logProbs[base + v]; if (p > bestV) { bestV = p; best = v; } }
      if (best !== prev && best !== blank) pieces.push(vocab[best] || "");
      prev = best;
    }
    return pieces.join("").replace(/▁/g, " ").replace(/\s+/g, " ").trim();
  }

  /** Parse "token id" lines (sherpa-onnx tokens.txt). */
  function parseTokens(text) {
    const vocab = [];
    let blank = -1;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const i = line.lastIndexOf(" ");
      const tok = line.slice(0, i), id = Number(line.slice(i + 1));
      vocab[id] = tok;
      if (tok === "<blk>" || tok === "<blank>") blank = id;
    }
    if (blank < 0) blank = vocab.length - 1;
    return { vocab, blank };
  }

  /** Run the model: ort is onnxruntime (web or node), session an InferenceSession. */
  async function transcribe(ort, session, tokens, samples) {
    const { data, frames } = features(samples);
    const feeds = {
      processed_signal: new ort.Tensor("float32", data, [1, N_MELS, frames]),
      processed_signal_length: new ort.Tensor("int64", BigInt64Array.from([BigInt(frames)]), [1]),
    };
    const out = await session.run(feeds);
    const lp = out.log_probs;
    const [, T, V] = lp.dims;
    const len = out.output_length ? Number(out.output_length.data[0]) : T;
    return decode(lp.data, Math.min(len, T), V, tokens.vocab, tokens.blank);
  }

  /** Any sample rate -> 16 kHz (linear interpolation; fine for speech). */
  function resample(samples, fromRate) {
    if (fromRate === SR) return samples;
    const ratio = fromRate / SR, n = Math.floor(samples.length / ratio);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pos = i * ratio, j = Math.floor(pos), f = pos - j;
      out[i] = (samples[j] || 0) * (1 - f) + (samples[j + 1] || 0) * f;
    }
    return out;
  }

  const MarathiASR = { features, decode, parseTokens, transcribe, resample, SR };
  if (typeof module !== "undefined" && module.exports) module.exports = MarathiASR;
  root.MarathiASR = MarathiASR;
})(typeof globalThis !== "undefined" ? globalThis : this);
