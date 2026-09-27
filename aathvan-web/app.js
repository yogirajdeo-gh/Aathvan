(() => {
  "use strict";
  const B = window.Brain;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const chatEl = $("#view-chat"), listEl = $("#list"), scroller = $("#scroller");
  const input = $("#input"), sendBtn = $("#send");

  // ---------- storage: IndexedDB, mirrored to localStorage ----------
  // Nothing is ever removed; the whole state is rewritten on each change.

  let state = { version: 1, memories: [], chat: [] };
  const LS_KEY = "aathvan-state";

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("aathvan", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function loadState() {
    try {
      const db = await idb();
      const got = await new Promise((res, rej) => {
        const r = db.transaction("kv").objectStore("kv").get("state");
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      if (got && Array.isArray(got.memories)) return got;
    } catch (e) {}
    try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (s && Array.isArray(s.memories)) return s; } catch (e) {}
    return null;
  }
  let saving = Promise.resolve();
  function persist() {
    const snapshot = JSON.parse(JSON.stringify(state));
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot)); } catch (e) {}
    saving = saving.then(async () => {
      try {
        const db = await idb();
        await new Promise((res, rej) => {
          const tx = db.transaction("kv", "readwrite");
          tx.objectStore("kv").put(snapshot, "state");
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
      } catch (e) {}
    });
  }

  const memory = (id) => state.memories.find((m) => m.id === id);
  const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function setDone(id, done) {
    const m = memory(id);
    if (!m) return;
    m.done = done;
    m.doneAt = done ? new Date().toISOString() : null;
    persist(); render();
  }

  // Runs one message through the brain and applies what it decided.
  function send(text, viaVoice = false, replyLang = null) {
    text = text.trim();
    if (!text) return null;
    const now = new Date();
    state.chat.push({ id: newId(), role: "user", text, at: now.toISOString(), voice: viaVoice || undefined });
    const plan = B.respond(text, state.memories, now, replyLang ? { lang: replyLang } : {});
    const actions = [];
    if (plan.add) { state.memories.push(plan.add); actions.push({ kind: "added", id: plan.add.id }); }
    for (const id of plan.complete) { const m = memory(id); if (m) { m.done = true; m.doneAt = now.toISOString(); actions.push({ kind: "completed", id }); } }
    for (const id of plan.reopen) { const m = memory(id); if (m) { m.done = false; m.doneAt = null; actions.push({ kind: "reopened", id }); } }
    const bot = { id: newId(), role: "bot", text: plan.reply, at: now.toISOString(), actions, refs: plan.refs, lang: plan.lang };
    state.chat.push(bot);
    persist(); render();
    return bot;
  }

  // ---------- formatting ----------

  const fmtSaved = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const fmtDue = (ymd) => B.fromYmd(ymd).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const todayYmd = () => B.ymd(new Date());

  // ---------- rendering ----------

  function memCard(m) {
    const card = el("div", "mem" + (m.done ? " is-done" : ""));
    const btn = el("button", "check"); btn.type = "button"; btn.innerHTML = CHECK;
    btn.setAttribute("aria-label", m.done ? "Reopen" : "Mark done");
    btn.onclick = () => setDone(m.id, !m.done);
    const body = el("div", "mbody");
    body.append(el("p", "mtext", m.text));
    const meta = el("div", "meta");
    meta.append(el("span", null, "Saved " + fmtSaved(m.createdAt)));
    if (m.due) {
      const late = !m.done && m.due < todayYmd();
      meta.append(el("span", "due" + (late ? " late" : ""), (late ? "Was due " : "Due ") + fmtDue(m.due)));
    }
    if (m.done && m.doneAt) meta.append(el("span", null, "Done " + fmtSaved(m.doneAt)));
    body.append(meta);
    card.append(btn, body);
    return card;
  }

  function chip(a) {
    const m = memory(a.id);
    const c = el("div", "chip" + (a.kind === "completed" ? " done" : ""));
    c.append(el("b", null, a.kind === "added" ? "Saved:" : a.kind === "completed" ? "Done:" : "Reopened:"), el("span", null, m ? m.text : ""));
    if (m && a.kind !== "added") {
      const u = el("button", "undo", "Undo"); u.type = "button";
      u.onclick = () => setDone(m.id, a.kind !== "completed");
      c.append(u);
    }
    return c;
  }

  function msgEl(msg) {
    const box = el("div", "msg " + (msg.role === "user" ? "me" : "bot"));
    if (msg.voice) box.append(el("span", "voice-tag", "🎙"));
    box.append(document.createTextNode(msg.text));
    (msg.actions || []).forEach((a) => box.append(chip(a)));
    (msg.refs || []).forEach((id) => { const m = memory(id); if (m) box.append(memCard(m)); });
    box.append(el("span", "time", fmtTime(msg.at)));
    return box;
  }

  function welcome() {
    const w = el("div", "welcome");
    w.append(el("p", null, "Tell me anything to remember, in English, मराठी or हिंदी. Type here, or tap the blue mic to talk. Ask me later and I'll find it. Say it's done and I'll tick it off. Nothing is ever deleted, and everything stays on this phone."));
    ["Remember: car insurance renews on 12 October", "आईच्या गोळ्या उद्या आणायच्या आहेत", "याद रखना, राहुल को 5000 रुपये उधार दिए", "What did I ask you to remember?"].forEach((s) => {
      const b = el("button", null, s); b.type = "button";
      b.onclick = () => { input.value = s; autosize(); input.focus(); };
      w.append(b);
    });
    return w;
  }

  function renderChat() {
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
    const nodes = [];
    let lastDay = null;
    for (const m of state.chat.slice(-400)) {
      const d = B.ymd(new Date(m.at));
      if (d !== lastDay) {
        nodes.push(el("div", "day", d === todayYmd() ? "Today" : fmtDue(d)));
        lastDay = d;
      }
      nodes.push(msgEl(m));
    }
    if (!nodes.length) nodes.push(welcome());
    chatEl.replaceChildren(...nodes);
    if (atBottom && !$("#view-chat").hidden) scroller.scrollTop = scroller.scrollHeight;
  }

  let filter = "open", query = "";
  function renderList() {
    const all = [...state.memories];
    $("#c-open").textContent = all.filter((m) => !m.done).length;
    $("#c-done").textContent = all.filter((m) => m.done).length;
    let list = all.filter((m) => filter === "all" || (filter === "done") === !!m.done);
    const q = query.trim();
    if (q) {
      const plain = list.filter((m) => m.text.toLowerCase().includes(q.toLowerCase()));
      const fuzzy = B.rank(B.tokens(B.normalize(q)), list);
      const seen = new Set();
      list = [...plain, ...fuzzy].filter((m) => !seen.has(m.id) && seen.add(m.id));
    } else if (filter === "open") {
      list.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || b.createdAt.localeCompare(a.createdAt));
    } else {
      list.sort((a, b) => (b.doneAt || b.createdAt).localeCompare(a.doneAt || a.createdAt));
    }
    const empty = q ? `No match for “${q}”.` : filter === "done" ? "Nothing marked done yet." : "Nothing here yet. Tell me something to remember in Chat.";
    listEl.replaceChildren(...(list.length ? list.map(memCard) : [el("p", "empty", empty)]));
  }

  const render = () => { renderChat(); renderList(); };

  // ---------- composer and tabs ----------

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
    sendBtn.disabled = !input.value.trim();
  }
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer: coarse)").matches) { e.preventDefault(); $("#composer").requestSubmit(); }
  });
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    input.value = ""; autosize();
    showTab("chat");
    send(text);
    scroller.scrollTop = scroller.scrollHeight;
  });

  function showTab(t) {
    $("#tab-chat").setAttribute("aria-selected", t === "chat");
    $("#tab-list").setAttribute("aria-selected", t === "list");
    $("#view-chat").hidden = t !== "chat";
    $("#view-list").hidden = t !== "list";
    scroller.scrollTop = t === "chat" ? scroller.scrollHeight : 0;
  }
  $("#tab-chat").onclick = () => showTab("chat");
  $("#tab-list").onclick = () => showTab("list");
  $("#search").addEventListener("input", (e) => { query = e.target.value; renderList(); });
  $("#seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    filter = b.dataset.f;
    document.querySelectorAll("#seg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderList();
  });

  // ---------- backup ----------

  const backupMsg = (t) => { const p = $("#backup-msg"); p.textContent = t; p.hidden = !t; };

  $("#export").onclick = async () => {
    const name = `Aathvan backup ${todayYmd()}.json`;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        backupMsg("Backup shared. Keep it in Files or iCloud Drive.");
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const a = el("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    backupMsg("Backup downloaded.");
  };

  // Restoring only ever adds: notes already here are kept as they are.
  $("#import").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.memories)) throw new Error("not a backup");
      const haveM = new Set(state.memories.map((m) => m.id));
      const haveC = new Set(state.chat.map((m) => m.id));
      const addM = data.memories.filter((m) => m && m.id && m.text && !haveM.has(m.id));
      const addC = (data.chat || []).filter((m) => m && m.id && !haveC.has(m.id));
      state.memories.push(...addM);
      state.chat.push(...addC);
      state.chat.sort((a, b) => a.at.localeCompare(b.at));
      persist(); render();
      backupMsg(addM.length ? `Restored ${addM.length} note${addM.length === 1 ? "" : "s"}. Nothing already here was changed.` : "Everything in that backup is already here.");
    } catch (err) {
      backupMsg("That file isn't an Aathvan backup. Pick the .json file you saved from “Save a backup copy”.");
    }
  });

  // ---------- voice chat ----------

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voice = $("#voice"), heard = $("#heard"), replyBox = $("#reply"), status = $("#voice-status"), bigMic = $("#big-mic");
  const speakToggle = $("#speak-toggle");
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  let voiceLang = store.get("aathvan-voice-lang", "mr-IN");
  let speakReplies = store.get("aathvan-speak", "1") === "1";
  let rec = null, listening = false, finalText = "", interimText = "";

  const VOICE_COPY = {
    "mr-IN": { tap: "बोलण्यासाठी टॅप करा", listening: "ऐकत आहे… (काही शब्द हिंदी स्पेलिंगमध्ये येऊ शकतात)", again: "पुन्हा बोलण्यासाठी टॅप करा", placeholder: "बोला… उदा. “उद्या दूध आणायचं आहे”" },
    "hi-IN": { tap: "बोलने के लिए टैप करें", listening: "सुन रहा हूँ… बोलकर रुकें", again: "फिर से बोलने के लिए टैप करें", placeholder: "बोलिए… जैसे “कल बिजली का बिल भरना है”" },
    "en-IN": { tap: "Tap to talk", listening: "Listening… pause when you're done", again: "Tap to talk again", placeholder: "Say something like “Remind me to call the bank on Monday”" },
  };
  const copy = () => VOICE_COPY[voiceLang];

  function paintLangs() {
    document.querySelectorAll("#langs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === voiceLang));
    speakToggle.setAttribute("aria-pressed", speakReplies);
  }
  function showHeard(text, placeholder) {
    heard.textContent = text;
    heard.classList.toggle("placeholder", !!placeholder);
  }

  function openVoice() {
    voice.hidden = false;
    replyBox.hidden = true;
    paintLangs();
    if (!Rec) {
      showHeard("Voice isn't available in this browser.", true);
      status.textContent = "Open Aathvan in Safari on your iPhone, or type in the chat instead.";
      bigMic.disabled = true;
      return;
    }
    startListening();
  }
  function closeVoice() {
    stopListening(true);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    voice.hidden = true;
  }

  // iPhone can accept a language it doesn't really support and then wait
  // forever, so these timers turn silence into a clear message.
  let micTimer = null, heardTimer = null, gotAudio = false, gotWords = false;
  const clearTimers = () => { clearTimeout(micTimer); clearTimeout(heardTimer); };

  function startListening() {
    if (!Rec || listening) return;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    finalText = ""; interimText = ""; gotAudio = false; gotWords = false;
    replyBox.hidden = true;
    showHeard(copy().placeholder, true);
    try {
      rec = new Rec();
      // iPhone doesn't offer Marathi speech recognition to websites, so Marathi
      // is heard through the Hindi recogniser (same script, lots of shared words).
      rec.lang = voiceLang === "mr-IN" ? "hi-IN" : voiceLang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onaudiostart = () => { gotAudio = true; status.textContent = copy().listening; };
      rec.onresult = (e) => {
        interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript; else interimText += r[0].transcript;
        }
        const t = (finalText + " " + interimText).trim();
        if (t) { gotWords = true; clearTimeout(heardTimer); showHeard(t, false); }
      };
      rec.onerror = (e) => { if (rec) rec._error = e.error; };
      rec.onend = () => finishListening(rec && rec._error);
      rec.start();
      listening = true;
      bigMic.classList.add("listening");
      bigMic.setAttribute("aria-label", "Stop");
      status.textContent = "Starting the microphone…";
      micTimer = setTimeout(() => { if (listening && !gotAudio) giveUp("no-mic"); }, 5000);
      heardTimer = setTimeout(() => { if (listening && !gotWords) giveUp("no-words"); }, 12000);
    } catch (err) {
      listening = false;
      status.textContent = "Couldn't start the microphone. Tap to try again.";
    }
  }

  function giveUp(reason) {
    if (rec) { rec.onend = null; rec.onresult = null; try { rec.abort(); } catch (e) {} rec = null; }
    finishListening(reason);
  }

  function stopListening(silent) {
    clearTimers();
    if (!rec) return;
    if (silent) { rec.onend = null; rec.onresult = null; try { rec.abort(); } catch (e) {} resetMic(); rec = null; return; }
    try { rec.stop(); } catch (e) {}
  }
  function resetMic() {
    listening = false;
    bigMic.classList.remove("listening");
    bigMic.setAttribute("aria-label", "Talk");
  }

  function finishListening(error) {
    clearTimers();
    resetMic();
    rec = null;
    const said = (finalText + " " + interimText).trim();
    if (said) {
      $("#kbd-fallback").hidden = true;
      const bot = send(said, true, voiceLang === "mr-IN" ? "mr" : null);
      showReply(bot);
      status.textContent = copy().again;
      return;
    }
    const langName = { "mr-IN": "Marathi", "hi-IN": "Hindi", "en-IN": "English" }[voiceLang];
    const messages = {
      "not-allowed": "Microphone is blocked. In Safari tap aA → Website Settings → Microphone → Allow, and turn on Settings → General → Keyboard → Enable Dictation.",
      "service-not-allowed": "Voice needs Dictation turned on: Settings → General → Keyboard → Enable Dictation. Then tap the mic again.",
      "network": "Your iPhone needs internet to understand " + langName + " by voice. You can still type, or use the keyboard mic.",
      "language-not-supported": "Your iPhone can't understand " + langName + " by voice here. Try another language, or use the keyboard mic.",
      "audio-capture": "No microphone found. Check that no other app is using it.",
      "no-mic": "The microphone didn't turn on. In Safari tap aA → Website Settings → Microphone → Allow, and check Settings → General → Keyboard → Enable Dictation.",
      "no-words": "The mic was on but no words came back. Your iPhone may not support " + langName + " voice in websites. Try हिंदी or English, or use the keyboard mic below.",
    };
    showHeard(copy().placeholder, true);
    status.textContent = messages[error] || (error === "no-speech" || !error ? "I didn't hear anything. " + copy().tap : "Something went wrong with voice. " + copy().tap);
    $("#kbd-fallback").hidden = false;
  }

  function showReply(bot) {
    replyBox.replaceChildren();
    replyBox.append(el("div", null, bot.text));
    const items = [...(bot.actions || []).map((a) => a.id), ...(bot.refs || [])].map(memory).filter(Boolean);
    if (items.length) {
      const ul = el("ul");
      items.slice(0, 6).forEach((m) => {
        const li = el("li", null, m.text);
        if (m.due) li.append(el("span", "sub", "  · " + fmtDue(m.due)));
        if (m.done) li.style.textDecoration = "line-through";
        ul.append(li);
      });
      replyBox.append(ul);
      if (items.length > 6) replyBox.append(el("div", "sub", `+${items.length - 6} more in the chat`));
    }
    replyBox.hidden = false;
    if (speakReplies) speak(bot, items);
  }

  // ---------- reading replies aloud ----------

  let voices = [];
  const loadVoices = () => { if ("speechSynthesis" in window) voices = speechSynthesis.getVoices(); };
  if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.addEventListener?.("voiceschanged", loadVoices); }

  function pickVoice(lang) {
    const want = { mr: ["mr-IN", "hi-IN"], hi: ["hi-IN"], en: ["en-IN", "en-GB", "en-US"] }[lang] || ["en-IN"];
    for (const code of want) {
      const v = voices.find((x) => x.lang.replace("_", "-").toLowerCase() === code.toLowerCase());
      if (v) return v;
    }
    return voices.find((x) => x.lang.toLowerCase().startsWith(want[0].slice(0, 2))) || null;
  }

  function speak(bot, items) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const lang = bot.lang || "en";
    const parts = [bot.text, ...items.slice(0, 3).map((m) => m.text)];
    const u = new SpeechSynthesisUtterance(parts.join(". "));
    const v = pickVoice(lang);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = B.LOCALE[lang]; }
    u.rate = 1;
    speechSynthesis.speak(u);
  }

  // ---------- voice wiring ----------

  $("#voice-open").onclick = openVoice;
  $("#voice-close").onclick = closeVoice;
  // The keyboard mic supports more languages (including Marathi) than website voice.
  $("#kbd-fallback").onclick = () => {
    closeVoice();
    showTab("chat");
    input.focus();
  };
  bigMic.onclick = () => (listening ? stopListening(false) : startListening());
  $("#langs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    voiceLang = b.dataset.lang;
    store.set("aathvan-voice-lang", voiceLang);
    paintLangs();
    if (listening) { stopListening(true); startListening(); }
    else { showHeard(copy().placeholder, true); status.textContent = copy().tap; }
  });
  speakToggle.onclick = () => {
    speakReplies = !speakReplies;
    store.set("aathvan-speak", speakReplies ? "1" : "0");
    if (!speakReplies && "speechSynthesis" in window) speechSynthesis.cancel();
    paintLangs();
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !voice.hidden) closeVoice(); });

  // ---------- start ----------

  (async () => {
    const saved = await loadState();
    if (saved) state = { version: 1, memories: saved.memories || [], chat: saved.chat || [] };
    render();
    showTab("chat");
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  })();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
