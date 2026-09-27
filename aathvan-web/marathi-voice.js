// Marathi voice for Aathvan: records from the microphone and turns speech into
// Marathi text on the phone with AI4Bharat's IndicConformer model.
// The model is downloaded once (about 200 MB) and kept on the phone.
(function (root) {
  "use strict";

  const MODEL_URL = "https://huggingface.co/yashwantraoraut/indic-conformer-marathi-onnx/resolve/main/model.int8.onnx";
  const TOKENS_URL = "https://huggingface.co/yashwantraoraut/indic-conformer-marathi-onnx/resolve/main/tokens.txt";
  const MODEL_CACHE = "aathvan-models";
  const APPROX_MB = 197;

  let session = null, tokens = null, loading = null, downloaded = false;

  async function cached(url) {
    try { return await (await caches.open(MODEL_CACHE)).match(url); } catch (e) { return null; }
  }

  async function checkDownloaded() {
    downloaded = !!(await cached(MODEL_URL)) && !!(await cached(TOKENS_URL));
    return downloaded;
  }

  /** One-time download with progress (0..1). */
  async function download(onProgress) {
    const cache = await caches.open(MODEL_CACHE);
    const t = await fetch(TOKENS_URL);
    if (!t.ok) throw new Error("download_failed");
    await cache.put(TOKENS_URL, t);

    const res = await fetch(MODEL_URL);
    if (!res.ok || !res.body) throw new Error("download_failed");
    const total = Number(res.headers.get("content-length")) || APPROX_MB * 1e6;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress && onProgress(Math.min(got / total, 1), got);
    }
    if (got < 50e6) throw new Error("download_failed");
    await cache.put(MODEL_URL, new Response(new Blob(chunks), { headers: { "content-type": "application/octet-stream" } }));
    downloaded = true;
  }

  /** Load the model into memory (a few seconds the first time per launch). */
  function load() {
    if (session) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      const ort = root.ort;
      ort.env.wasm.wasmPaths = new URL("vendor/", document.baseURI).href;
      ort.env.wasm.numThreads = 1;         // GitHub Pages can't enable multi-threading
      const [m, t] = await Promise.all([cached(MODEL_URL), cached(TOKENS_URL)]);
      if (!m || !t) throw new Error("not_downloaded");
      tokens = root.MarathiASR.parseTokens(await t.text());
      session = await ort.InferenceSession.create(new Uint8Array(await m.arrayBuffer()), { executionProviders: ["wasm"] });
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  async function transcribe(samples16k) {
    await load();
    return root.MarathiASR.transcribe(root.ort, session, tokens, samples16k);
  }

  /**
   * Start recording. Stops by itself after ~1.5 s of silence following speech,
   * or after 30 s. Returns { stop(): Promise<Float32Array 16 kHz>, cancel() }.
   */
  async function record({ onLevel, onAutoStop } = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const started = performance.now();
    let floor = null, spoke = false, lastLoud = started, ended = false;

    proc.onaudioprocess = (e) => {
      if (ended) return;
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const rms = Math.sqrt(s / d.length);
      const now = performance.now();
      if (floor === null || now - started < 400) floor = floor === null ? rms : Math.min(floor * 0.9 + rms * 0.1, rms * 1.5);
      const threshold = Math.max(0.012, floor * 3);
      if (rms > threshold) { spoke = true; lastLoud = now; }
      onLevel && onLevel(Math.min(rms / 0.1, 1));
      if ((spoke && now - lastLoud > 1500) || now - started > 30000) { ended = true; onAutoStop && onAutoStop(); }
    };
    src.connect(proc);
    proc.connect(ctx.destination);

    const shutdown = () => {
      ended = true;
      try { proc.disconnect(); src.disconnect(); } catch (e) {}
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    };
    return {
      async stop() {
        const rate = ctx.sampleRate;
        shutdown();
        const n = chunks.reduce((a, c) => a + c.length, 0);
        const all = new Float32Array(n);
        let o = 0;
        for (const c of chunks) { all.set(c, o); o += c.length; }
        return { samples: root.MarathiASR.resample(all, rate), spoke };
      },
      cancel: shutdown,
    };
  }

  root.MarathiVoice = {
    checkDownloaded, download, load, transcribe, record,
    get downloaded() { return downloaded; },
    get ready() { return !!session; },
    APPROX_MB,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
