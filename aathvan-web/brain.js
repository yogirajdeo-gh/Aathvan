// Aathvan's brain: understands English, Marathi and Hindi (Devanagari or
// Roman script) with plain rules. Runs fully offline, in the page or in Node.
(function (root) {
  "use strict";

  // ---------- Normalising ----------

  const DEV_DIGITS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };

  function normalize(s) {
    let out = "";
    for (const ch of String(s).toLowerCase()) {
      if (DEV_DIGITS[ch]) out += DEV_DIGITS[ch];
      else if (ch === "’" || ch === "‘") out += "'";
      else out += ch;
    }
    return out;
  }

  const WORD_CHAR = /[\p{L}\p{M}\p{N}']/u;

  function words(norm) {
    const out = [];
    let cur = "";
    for (const ch of norm) {
      if (WORD_CHAR.test(ch)) cur += ch;
      else if (cur) { out.push(cur); cur = ""; }
    }
    if (cur) out.push(cur);
    return out.map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean);
  }

  const isDevanagari = (s) => /[ऀ-ॿ]/.test(s);

  // ---------- Transliteration ----------

  const CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    "क़": "k", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y",
  };
  const VOWELS = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ru", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e" };
  const MATRAS = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ru", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e" };

  function translit(s) {
    let out = "", pendingA = false;
    for (const ch of s) {
      if (CONS[ch]) { if (pendingA) out += "a"; out += CONS[ch]; pendingA = true; }
      else if (MATRAS[ch]) { out += MATRAS[ch]; pendingA = false; }
      else if (ch === "्") { pendingA = false; }                 // virama
      else if (ch === "़") { /* nukta */ }
      else if (VOWELS[ch]) { if (pendingA) out += "a"; out += VOWELS[ch]; pendingA = false; }
      else if (ch === "ं" || ch === "ँ") { if (pendingA) out += "a"; out += "n"; pendingA = false; }
      else if (ch === "ः") { if (pendingA) out += "a"; out += "h"; pendingA = false; }
      else { pendingA = false; out += ch; }                           // word-final "a" is silent
    }
    return out;
  }

  const CONSONANT_SET = new Set("bcdfgjklmnprstvy");

  // Spelling-tolerant key: "दूध", "doodh" and "dudh" all become "dud".
  function key(word) {
    if (/^\d+$/.test(word)) return word;
    let s = translit(normalize(word));
    for (const [a, b] of [["chh", "ch"], ["ph", "f"], ["sh", "s"], ["w", "v"], ["z", "j"], ["q", "k"], ["x", "ks"], ["ee", "i"], ["oo", "u"]]) {
      s = s.split(a).join(b);
    }
    const letters = [...s].filter((c) => /[\p{L}\p{N}]/u.test(c));
    const out = [];
    letters.forEach((ch, i) => {
      let c = ch;
      if (c === "c" && letters[i + 1] !== "h") c = "k";
      const prev = out[out.length - 1];
      if (c === "h" && prev && CONSONANT_SET.has(prev)) return;
      if (c === "a" && out.length) return;
      if (prev === c) return;
      out.push(c);
    });
    return out.join("");
  }

  // ---------- Cross-language word groups ----------

  const CONCEPTS = {
    milk: ["milk", "दूध", "doodh", "dudh"],
    medicine: ["medicine", "medicines", "tablet", "tablets", "pills", "गोळी", "गोळ्या", "औषध", "औषधं", "औषधे", "दवा", "दवाई", "दवाइयां", "goli", "golya", "aushadh", "dawa", "dawai", "davai", "गोली", "गोलियां", "गोलियाँ", "goliyan", "golian", "goliya"],
    money: ["money", "cash", "पैसे", "पैसा", "रुपये", "रुपया", "रक्कम", "paise", "paisa", "rupaye", "rupees", "rs"],
    mother: ["mom", "mother", "mummy", "mum", "आई", "माँ", "मां", "मम्मी", "aai", "aie", "maa", "ma"],
    father: ["dad", "father", "papa", "बाबा", "वडील", "पापा", "पिताजी", "baba", "vadil", "pitaji"],
    birthday: ["birthday", "bday", "वाढदिवस", "जन्मदिन", "vadhdivas", "vaddivas", "janmdin"],
    key: ["key", "keys", "चावी", "चाव्या", "चाबी", "chavi", "chabi"],
    doctor: ["doctor", "dr", "डॉक्टर", "डॉक्टरांना", "वैद्य", "daktar", "doktar"],
    bill: ["bill", "bills", "बिल", "बिले"],
    electricity: ["electricity", "light", "लाईट", "बिजली", "वीज", "bijli", "vij"],
    vegetables: ["vegetables", "veggies", "भाजी", "भाज्या", "सब्जी", "सब्ज़ी", "bhaji", "bhajya", "sabji", "sabzi"],
    school: ["school", "शाळा", "शाळेत", "स्कूल", "shala", "shaalaa"],
    bank: ["bank", "बँक", "बैंक"],
    phone: ["phone", "call", "mobile", "फोन", "कॉल", "मोबाईल", "मोबाइल"],
    passport: ["passport", "पासपोर्ट"],
    insurance: ["insurance", "policy", "विमा", "बीमा", "इन्शुरन्स", "इंश्योरेंस", "vima", "bima"],
    rent: ["rent", "भाडे", "भाडं", "किराया", "bhade", "kiraya"],
    gas: ["gas", "cylinder", "सिलेंडर", "गॅस", "गैस"],
    wife: ["wife", "बायको", "पत्नी", "biwi", "बीवी", "bayko", "patni"],
    husband: ["husband", "नवरा", "पति", "navra", "pati"],
    son: ["son", "मुलगा", "बेटा", "mulga", "beta"],
    daughter: ["daughter", "मुलगी", "बेटी", "mulgi", "beti"],
    friend: ["friend", "मित्र", "मैत्रीण", "दोस्त", "mitra", "dost"],
    car: ["car", "गाडी", "कार", "gadi", "gaadi"],
    house: ["house", "home", "घर", "ghar"],
    fees: ["fee", "fees", "फी", "फीस", "fi"],
    gold: ["gold", "सोनं", "सोने", "सोना", "sona", "sone"],
    lent: ["lent", "loan", "उधार", "udhar", "udhaar"],
  };
  const CONCEPT_BY_RAW = {}, CONCEPT_BY_KEY = {};
  for (const [c, ws] of Object.entries(CONCEPTS)) {
    for (const w of ws) {
      CONCEPT_BY_RAW[normalize(w)] = c;
      const k = key(w);
      if (k.length >= 3) CONCEPT_BY_KEY[k] = c;           // short keys collide ("kal" / "call")
    }
  }

  function tokens(norm) {
    return words(norm).map((w) => {
      const k = key(w);
      return { raw: w, key: k, concept: CONCEPT_BY_RAW[w] || (k.length >= 3 ? CONCEPT_BY_KEY[k] : undefined) };
    });
  }

  // ---------- Similarity ----------

  function levenshtein(a, b) {
    const x = [...a], y = [...b];
    if (!x.length) return y.length;
    if (!y.length) return x.length;
    let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
    for (let i = 1; i <= x.length; i++) {
      const cur = [i];
      for (let j = 1; j <= y.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[y.length];
  }

  function similarity(q, m) {
    if (q.concept && q.concept === m.concept) return 1;
    const a = q.key, b = m.key;
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (long.startsWith(short)) {
      if (short.length >= 3) return 0.85;
      if (short.length === 2 && q.raw.length >= 2) return 0.6;
    }
    let prefix = 0;
    while (prefix < short.length && a[prefix] === b[prefix]) prefix++;
    if (short.length >= 4 && prefix >= Math.ceil(short.length * 0.75)) return 0.75;
    const d = levenshtein(a, b);
    if (short.length >= 4 && d <= 1) return 0.8;
    if (short.length >= 6 && d <= 2) return 0.6;
    return 0;
  }

  // ---------- Language of a message ----------

  const MR_WORDS = new Set(["आहे", "आहेत", "काय", "झालं", "झाले", "मला", "मी", "उद्या", "परवा", "कधी", "कुठे", "सांग", "ठेव", "आणि", "पण", "केलं", "होतं", "आठवण", "लक्षात", "आणायचे", "आणायच्या", "आहेस", "तू", "माझे", "माझी", "माझा", "कोणते", "सांगितलं",
    "aahe", "ahe", "kay", "zala", "jhala", "mala", "mi", "udya", "parva", "kadhi", "kuthe", "sang", "thev", "ani", "pan", "lakshat", "athvan", "aathvan", "kela", "hota", "aahet", "majhe", "maze", "sangitla"]);
  const HI_WORDS = new Set(["है", "हैं", "क्या", "मुझे", "मैं", "कल", "परसों", "कब", "कहाँ", "कहां", "बताओ", "रखना", "रखो", "और", "लेकिन", "को", "में", "से", "था", "थी", "याद", "गया", "गई", "मेरा", "मेरी", "मैंने", "दिया", "लाना", "करना",
    "hai", "hain", "kya", "mujhe", "main", "kal", "parso", "kab", "kahan", "batao", "rakhna", "rakho", "aur", "lekin", "ko", "mein", "se", "tha", "thi", "yaad", "gaya", "mera", "meri", "maine", "diya", "lana", "karna"]);

  function detectLang(norm) {
    const ws = words(norm);
    const mr = ws.filter((w) => MR_WORDS.has(w)).length;
    const hi = ws.filter((w) => HI_WORDS.has(w)).length;
    if (!mr && !hi) return isDevanagari(norm) ? "mr" : "en";
    return hi > mr ? "hi" : "mr";
  }

  // ---------- Dates ----------

  const DAY = 86400000;
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return startOfDay(x); };
  const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

  const MONTHS = (() => {
    const m = {};
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
      .forEach((n, i) => { m[n] = i + 1; m[n.slice(0, 3)] = i + 1; });
    m.sept = 9;
    ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"].forEach((n, i) => { m[n] = i + 1; });
    ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"].forEach((n, i) => { m[n] = i + 1; });
    Object.assign(m, { "सितम्बर": 9, "अक्तूबर": 10, "नवम्बर": 11, "दिसम्बर": 12 });
    return m;
  })();

  const WEEKDAYS = { // 0 = Sunday
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thurs: 4, fri: 5, sat: 6,
    "रविवार": 0, "सोमवार": 1, "मंगळवार": 2, "मंगलवार": 2, "बुधवार": 3, "गुरुवार": 4, "बृहस्पतिवार": 4, "शुक्रवार": 5, "शनिवार": 6, "इतवार": 0,
    "रविवारी": 0, "सोमवारी": 1, "मंगळवारी": 2, "बुधवारी": 3, "गुरुवारी": 4, "शुक्रवारी": 5, "शनिवारी": 6,
    ravivar: 0, somvar: 1, mangalvar: 2, mangalwar: 2, budhvar: 3, budhwar: 3, guruvar: 4, guruwar: 4,
    shukravar: 5, shukrawar: 5, shanivar: 6, shaniwar: 6, itvar: 0, itwar: 0, somwar: 1,
    ravivari: 0, somvari: 1, mangalvari: 2, budhvari: 3, guruvari: 4, shukravari: 5, shanivari: 6,
  };

  const PAST_MARKERS = new Set(["था", "थी", "थे", "किया", "गया", "गई", "दिया", "लिया", "tha", "thi", "the", "kiya", "gaya", "gayi", "diya", "liya"]);

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const RE_DAY_MONTH = new RegExp(`(?<![0-9])(\\d{1,2})\\s*(?:st|nd|rd|th|तारीख)?\\s*(?:of\\s+)?(${MONTH_ALT})(?:ला|च्या|ची|मध्ये|को)?(?![\\p{L}\\p{M}])(?:,?\\s*(\\d{4}))?`, "u");
  const RE_MONTH_DAY = new RegExp(`(?<![\\p{L}\\p{M}])(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![0-9])(?:,?\\s*(\\d{4}))?`, "u");
  const RE_NUMERIC = /(?<![0-9/.-])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![0-9/])|(?<![0-9/.-])(\d{1,2})[.-](\d{1,2})[.-](\d{4})(?![0-9])/u;
  const RE_IN_DAYS = /(\d{1,3})\s*(?:days?|दिवसांनी|दिवसात|दिवस|दिनों|दिन|dinon|din|divas)(?![\p{L}\p{M}])/u;

  function hasAny(norm, wset, list) {
    return list.some((p) => (p.includes(" ") ? norm.includes(p) : wset.has(p)));
  }

  function explicitDate(norm, today) {
    const make = (day, month, year) => {
      let y = year || today.getFullYear();
      if (y < 100) y += 2000;
      const d = new Date(y, month - 1, day);
      if (d.getDate() !== day || d.getMonth() !== month - 1) return null;
      if (!year && d < today) return new Date(y + 1, month - 1, day);
      return d;
    };
    let m = norm.match(RE_DAY_MONTH);
    if (m) return make(+m[1], MONTHS[m[2]], m[3] ? +m[3] : 0);
    m = norm.match(RE_MONTH_DAY);
    if (m) return make(+m[2], MONTHS[m[1]], m[3] ? +m[3] : 0);
    m = norm.match(RE_NUMERIC);
    if (m) {
      if (m[1] && +m[2] >= 1 && +m[2] <= 12) return make(+m[1], +m[2], m[3] ? +m[3] : 0);
      if (m[4] && +m[5] >= 1 && +m[5] <= 12) return make(+m[4], +m[5], +m[6]);
    }
    return null;
  }

  // A day mentioned in the text. Past days are returned too (for questions).
  function parseDate(norm, now) {
    const today = startOfDay(now);
    const ws = words(norm);
    const wset = new Set(ws);
    const e = explicitDate(norm, today);
    if (e) return e;
    const n = norm.match(RE_IN_DAYS);
    if (n) return addDays(today, +n[1]);
    if (hasAny(norm, wset, ["day after tomorrow", "परवा", "परसों", "parva", "parwa", "parso", "parson"])) return addDays(today, 2);
    if (hasAny(norm, wset, ["tomorrow", "tmrw", "tmr", "उद्या", "udya", "udyaa", "uddya"])) return addDays(today, 1);
    if (wset.has("कल") || wset.has("kal")) return ws.some((w) => PAST_MARKERS.has(w)) ? addDays(today, -1) : addDays(today, 1);
    if (hasAny(norm, wset, ["yesterday", "काल", "kaal"])) return addDays(today, -1);
    if (hasAny(norm, wset, ["today", "tonight", "आज", "aaj", "aj"])) return today;
    if (hasAny(norm, wset, ["next week", "पुढच्या आठवड्यात", "पुढील आठवड्यात", "पुढच्या आठवड्याला", "अगले हफ्ते", "अगले सप्ताह", "pudhchya athvadyat", "agle hafte", "agle hafta"])) return addDays(today, 7);
    for (const w of ws) {
      if (w in WEEKDAYS) {
        let diff = (WEEKDAYS[w] - today.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        return addDays(today, diff);
      }
    }
    return null;
  }

  // ---------- Word lists ----------

  const REMEMBER = [
    "remember", "remind me", "don't forget", "dont forget", "do not forget", "note that", "note down", "make a note", "save this", "save that", "keep in mind",
    "लक्षात ठेव", "लक्षात ठेवा", "लक्षात असू दे", "आठवण ठेव", "आठवण करून दे", "आठवण करून द्या", "लिहून ठेव", "नोंद कर", "नोंद करा", "विसरू नको", "विसरू नकोस",
    "याद रख", "याद रखना", "याद रखो", "याद रखें", "याद दिला", "याद दिलाना", "नोट कर", "नोट करो", "नोट कर लो", "भूलना मत", "मत भूलना",
    "lakshat thev", "lakshat theva", "laxat thev", "lakshat thew", "athvan thev", "aathvan thev", "athvan karun de", "lihun thev", "visru nako",
    "yaad rakh", "yad rakh", "yaad rakhna", "yaad rakho", "yad rakhna", "yaad dila", "yaad dilana", "note kar", "note karo", "bhoolna mat", "bhulna mat",
  ];
  const DONE = [
    "done", "completed", "complete", "finished", "finish", "paid", "bought", "returned", "submitted", "collected", "mark done", "mark as done", "tick off",
    "झालं", "झाले", "झाला", "झाली", "झालंय", "झालेलं", "केलं", "केले", "केला", "केली", "केलंय", "पूर्ण", "आणलं", "आणले", "आणला", "आणली", "आणल्या", "भरलं", "भरले", "भरला", "दिलं", "दिले", "दिला", "घेतलं", "घेतले", "घेतला",
    "हो गया", "हो गई", "हो गयी", "कर दिया", "कर लिया", "कर दी", "कर ली", "ले आया", "ले आई", "ले लिया", "ले ली", "भर दिया", "दे दिया", "दे दी", "खत्म", "पूरा", "पूरी",
    "zala", "jhala", "zhala", "zale", "jhale", "zali", "jhali", "zalay", "kela", "kele", "keli", "kelay", "purna", "poorna", "anla", "aanla", "anli", "aanli", "bharla", "bharle", "dila", "dile", "ghetla", "ghetle",
    "ho gaya", "ho gayi", "ho gai", "kar diya", "kar liya", "kar di", "le aaya", "le aayi", "le liya", "bhar diya", "de diya", "de di", "khatam", "khatm", "pura", "poora",
  ];
  const REOPEN = [
    "reopen", "not done", "undo", "not finished", "not yet done", "still pending", "mark open", "mark as not done",
    "झालं नाही", "झाले नाही", "अजून बाकी", "पुन्हा उघड", "नहीं हुआ", "नहीं हुई", "फिर से खोल", "अभी बाकी",
    "zala nahi", "jhala nahi", "ajun baki", "nahi hua", "nahi hui", "abhi baaki", "abhi baki",
  ];
  const DELETE = [
    "delete", "remove", "forget it", "forget that", "erase", "clear",
    "डिलीट", "काढून टाक", "काढून टाका", "पुसून टाक", "विसरून जा", "हटा", "हटाओ", "हटा दो", "मिटा", "मिटा दो", "भूल जाओ", "भूल जा", "डिलीट करो",
    "kadhun tak", "visrun ja", "hata do", "hatao", "mita do", "bhool jao", "bhool ja", "bhul ja",
  ];
  const GREETINGS = new Set(["hi", "hello", "hey", "hii", "namaste", "namaskar", "नमस्ते", "नमस्कार", "हाय", "हॅलो", "हेलो", "good", "morning", "evening", "gm"]);
  const THANKS = ["thanks", "thank you", "thx", "धन्यवाद", "शुक्रिया", "थँक्यू", "थैंक यू", "dhanyavad", "dhanyawad", "shukriya", "ok thanks"];
  const EN_Q_START = new Set(["what", "when", "where", "which", "who", "whom", "how", "did", "do", "does", "have", "is", "are", "show", "list", "tell", "find", "search", "any", "anything", "give"]);
  const Q_WORDS = new Set([
    "काय", "कधी", "कुठे", "कुठं", "कोणते", "कोणता", "कोणती", "कोणत्या", "कोण", "किती", "सांग", "सांगा", "दाखव", "दाखवा", "शोध", "शोधा", "यादी",
    "क्या", "कब", "कहाँ", "कहां", "कौन", "कौनसा", "कौनसी", "कितना", "कितने", "कितनी", "बताओ", "बता", "बताना", "दिखाओ", "दिखा", "ढूंढो", "लिस्ट",
    "kay", "kaay", "kadhi", "kuthe", "konte", "konta", "konti", "kon", "kiti", "sang", "sanga", "dakhav", "dakhva",
    "kya", "kab", "kahan", "kaha", "kaun", "kaunsa", "kitna", "kitne", "kitni", "batao", "bata", "dikhao", "dikha",
  ]);
  // Words that, inside a question, ask for finished things ("what have I completed?").
  const DONE_STATUS = ["done", "completed", "complete", "finished", "finish", "पूर्ण", "पूरा", "पूरे", "पूरी", "झालेल्या", "झालेले", "zalele", "purna", "poorna", "pura", "poora", "ho gaye", "हो गए", "ho gaya", "हो गया"];
  const PENDING = ["pending", "remaining", "left", "open", "incomplete", "to do", "todo", "बाकी", "उरलेलं", "उरलेले", "बचा", "बचे", "बाकी है", "baki", "baaki", "urlele", "bacha", "bache"];

  const STOP = (() => {
    const base = [
      "a", "an", "the", "i", "me", "my", "mine", "you", "your", "to", "of", "for", "in", "on", "at", "by", "with", "and", "or", "but", "is", "are", "was", "were", "be", "been", "it", "this", "that", "these", "those",
      "please", "pls", "plz", "what", "when", "where", "which", "who", "how", "did", "do", "does", "have", "has", "had", "show", "list", "tell", "find", "search", "any", "anything", "all", "about", "ask", "asked", "told", "said", "say", "saved", "save", "note", "notes", "things", "thing", "stuff", "can", "could", "will", "would", "should", "need", "needs", "must", "give", "get", "got", "let", "know", "there", "mark", "as", "so", "just", "also", "then", "from", "up", "am", "ok", "okay", "haven't", "hasn't", "didn't", "not", "yet", "now", "again", "reminder", "reminders", "remembered", "everything", "something",
      "मी", "मला", "माझा", "माझी", "माझे", "माझ्या", "तू", "तुला", "तुम्ही", "आहे", "आहेत", "होतं", "होते", "होता", "होती", "की", "ला", "ना", "तर", "पण", "आणि", "व", "हे", "ते", "ती", "तो", "या", "त्या", "ने", "चा", "ची", "चे", "च्या", "मध्ये", "वर", "साठी", "सांगितलं", "सांगितले", "सांगितला", "ठेवलं", "ठेवले", "ठेवायला", "ठेव", "ठेवा", "लक्षात", "आठवण", "गोष्टी", "गोष्ट", "सगळं", "सगळे", "सर्व", "काही", "का", "आहेस", "कृपया", "नाही", "बाकी", "जे", "जी", "आज", "उद्या", "परवा", "काल",
      "मैं", "मुझे", "मेरा", "मेरी", "मेरे", "मैंने", "तुम", "तुमने", "आप", "है", "हैं", "था", "थी", "थे", "का", "की", "के", "को", "में", "से", "पर", "और", "या", "ये", "यह", "वो", "वह", "कि", "बताया", "कहा", "बोला", "याद", "रखना", "रखो", "रखने", "रखा", "सब", "सारे", "कुछ", "चीजें", "चीज़ें", "बातें", "बात", "लिए", "नहीं", "भी", "तो", "ही", "आज", "कल", "परसों",
      "mi", "mala", "maza", "majha", "mazi", "majhi", "maze", "majhe", "tu", "tula", "aahe", "ahe", "aahet", "hota", "hote", "hoti", "ki", "la", "na", "tar", "pan", "ani", "he", "te", "ti", "to", "ya", "tya", "ne", "cha", "chi", "che", "chya", "madhe", "var", "sathi", "sangitla", "sangitle", "thevla", "thevayla", "thev", "lakshat", "athvan", "aathvan", "goshti", "sagla", "sagle", "sarva", "kahi", "ka", "nahi", "je", "aaj", "udya", "parva",
      "main", "mujhe", "mera", "meri", "mere", "maine", "tum", "aap", "hai", "hain", "tha", "thi", "the", "ke", "ko", "mein", "me", "se", "par", "aur", "yeh", "ye", "wo", "woh", "bataya", "kaha", "bola", "yaad", "yad", "rakhna", "rakho", "rakha", "sab", "kuch", "cheezein", "baatein", "baat", "liye", "bhi", "toh", "hi", "kal", "parso",
      "today", "tomorrow", "tonight", "yesterday", "week", "next", "day", "days", "aj", "udyaa", "tmrw", "आठवड्यात", "हफ्ते", "सप्ताह", "अगले", "पुढच्या",
    ];
    const s = new Set(base.map(normalize));
    // Words inside command phrases are fillers too, except real things like
    // "आई" (mother) that happen to appear in a phrase such as "ले आई".
    for (const list of [REMEMBER, DONE, REOPEN, DELETE, PENDING, THANKS]) for (const p of list) for (const w of words(normalize(p))) if (!CONCEPT_BY_RAW[w]) s.add(w);
    for (const w of Q_WORDS) s.add(w);
    for (const w of Object.keys(WEEKDAYS)) s.add(w);
    for (const w of Object.keys(MONTHS)) s.add(w);
    return s;
  })();

  // ---------- Replies ----------

  const pick = (l, en, mr, hi) => (l === "mr" ? mr : l === "hi" ? hi : en);
  const LOCALE = { en: "en-IN", mr: "mr-IN", hi: "hi-IN" };
  const dayName = (d, l) => new Intl.DateTimeFormat(LOCALE[l], { weekday: "short", day: "numeric", month: "short" }).format(d);

  const Say = {
    greeting: (l) => pick(l, "Hi! Tell me anything to remember, or ask me what you saved.", "नमस्कार! काहीही लक्षात ठेवायला सांगा, किंवा काय ठेवलंय ते विचारा.", "नमस्ते! कुछ भी याद रखने को कहें, या पूछें कि क्या याद रखा है।"),
    welcome: (l) => pick(l, "You're welcome!", "काही हरकत नाही!", "कोई बात नहीं!"),
    whatToRemember: (l) => pick(l, "What should I remember?", "काय लक्षात ठेवू?", "क्या याद रखूँ?"),
    saved: (l, due) => {
      const base = pick(l, "Got it. I'll remember that.", "लक्षात ठेवलं.", "याद रख लिया।");
      if (!due) return base;
      const d = dayName(due, l);
      return base + " " + pick(l, `For ${d}.`, `तारीख: ${d}.`, `तारीख: ${d}।`);
    },
    found: (l, n) => (n === 1 ? pick(l, "Here's what I found:", "हे सापडलं:", "ये मिला:") : pick(l, `I found ${n}:`, `${n} गोष्टी सापडल्या:`, `${n} चीज़ें मिलीं:`)),
    notFound: (l) => pick(l, "I couldn't find anything about that.", "याबद्दल काहीच सापडलं नाही.", "इसके बारे में कुछ नहीं मिला।"),
    openList: (l, n, dated) => {
      if (n === 0) return dated ? pick(l, "Nothing for that day.", "त्या दिवसासाठी काहीच नाही.", "उस दिन के लिए कुछ नहीं है।") : pick(l, "Nothing pending. All clear!", "काहीच बाकी नाही!", "कुछ भी बाकी नहीं है!");
      if (dated) return Say.found(l, n);
      return n === 1 ? pick(l, "You have 1 thing to remember:", "एक गोष्ट बाकी आहे:", "एक काम बाकी है:") : pick(l, `You have ${n} things to remember:`, `${n} गोष्टी बाकी आहेत:`, `${n} काम बाकी हैं:`);
    },
    doneList: (l, n) => (n === 0 ? pick(l, "Nothing marked done yet.", "अजून काहीच पूर्ण केलेलं नाही.", "अभी तक कुछ पूरा नहीं हुआ।") : pick(l, `You've finished ${n}:`, `${n} गोष्टी पूर्ण झाल्या:`, `${n} काम पूरे हुए:`)),
    completed: (l) => pick(l, "Nice, marked as done.", "छान! पूर्ण झालं म्हणून नोंदवलं.", "बढ़िया! पूरा हुआ मार्क कर दिया।"),
    reopened: (l) => pick(l, "Reopened it.", "पुन्हा उघडलं.", "फिर से खोल दिया।"),
    whichOne: (l) => pick(l, "Which one? Tap the circle next to it.", "कोणतं? त्याच्या शेजारच्या वर्तुळावर टॅप करा.", "कौन सा? उसके पास वाले गोले पर टैप करें।"),
    noOpenMatch: (l) => pick(l, "I couldn't tell which one you finished. Tap the circle on the right one:", "कोणतं पूर्ण झालं ते कळलं नाही. योग्य गोष्टीच्या वर्तुळावर टॅप करा:", "समझ नहीं आया कौन सा पूरा हुआ। सही वाले के गोले पर टैप करें:"),
    neverDelete: (l) => pick(l, "I never delete anything. If it's finished, tap the circle to mark it done.", "मी काहीही डिलीट करत नाही. पूर्ण झालं असेल तर वर्तुळावर टॅप करून खूण करा.", "मैं कुछ भी डिलीट नहीं करता। अगर पूरा हो गया है तो गोले पर टैप करके मार्क करें।"),
  };

  // ---------- Matching ----------

  function contentTokens(norm) {
    const seen = new Set();
    return tokens(norm).filter((t) => !STOP.has(t.raw) && t.key && !seen.has(t.key) && seen.add(t.key));
  }

  const memTokens = (m) => tokens(normalize(m.text));

  function scoreAll(q, memories) {
    return memories.map((m) => {
      const mt = memTokens(m);
      const total = q.reduce((acc, t) => acc + Math.max(0, ...mt.map((x) => similarity(t, x))), 0);
      return { m, s: q.length ? total / q.length : 0 };
    }).sort((a, b) => b.s - a.s || b.m.createdAt.localeCompare(a.m.createdAt));
  }

  function rank(q, memories, minScore = 0.5) {
    if (!q.length) return [];
    const sc = scoreAll(q, memories);
    const best = sc.length ? sc[0].s : 0;
    return sc.filter((x) => x.s >= minScore && x.s >= best * 0.6).map((x) => x.m);
  }

  function isQuestion(norm, ws) {
    if (norm.trim().endsWith("?")) return true;
    const lead = ws[0] === "please" || ws[0] === "plz" ? ws[1] : ws[0];
    if (lead && EN_Q_START.has(lead)) return true;
    return ws.some((w) => Q_WORDS.has(w));
  }

  function cleanNote(text) {
    let s = text;
    for (const p of [...REMEMBER].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(escapeRe(p), "giu");
      s = s.replace(re, " ");
    }
    s = s.replace(/\s+/g, " ");
    const edge = /^[\s:,\-–—.।;!]+|[\s:,\-–—.।;!]+$/gu;
    const leading = ["that ", "to ", "about ", "please ", "plz ", "की ", "कि ", "ki ", "ke ", "कृपया ", "the fact that "];
    const trailing = [" please", " plz", " की", " कि", " ki", " ha", " हं", " बरं", " na", " ना"];
    let changed = true;
    while (changed) {
      changed = false;
      s = s.replace(edge, "");
      for (const p of leading) if (s.toLowerCase().startsWith(p)) { s = s.slice(p.length); changed = true; }
      for (const p of trailing) if (s.toLowerCase().endsWith(p)) { s = s.slice(0, -p.length); changed = true; }
    }
    if (s && s[0] !== s[0].toUpperCase()) s = s[0].toUpperCase() + s.slice(1);
    return s;
  }

  let idCounter = 0;
  const newId = () => "m" + Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6);

  function save(text, norm, lang, now) {
    const note = cleanNote(text);
    if (!note) return { lang, reply: Say.whatToRemember(lang) };
    let due = parseDate(norm, now);
    if (due && due < startOfDay(now)) due = null;
    const m = { id: newId(), text: note, createdAt: now.toISOString(), due: due ? ymd(due) : null, done: false, doneAt: null, said: text };
    return { lang, reply: Say.saved(lang, due), add: m };
  }

  function pickOne(norm, pool) {
    const q = contentTokens(norm);
    if (!q.length) return { sure: null, candidates: [...pool].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5) };
    const s = scoreAll(q, pool).filter((x) => x.s >= 0.5);
    if (!s.length) return { sure: null, candidates: [] };
    if (s.length === 1 || s[0].s - s[1].s >= 0.25) return { sure: s[0].m, candidates: [] };
    return { sure: null, candidates: s.slice(0, 5).map((x) => x.m) };
  }

  function completeFlow(norm, lang, memories) {
    const open = memories.filter((m) => !m.done);
    if (!open.length) return { lang, reply: Say.openList(lang, 0, false), nothingMatched: true };
    const { sure, candidates } = pickOne(norm, open);
    if (sure) return { lang, reply: Say.completed(lang), complete: [sure.id] };
    if (candidates.length) return { lang, reply: Say.whichOne(lang), refs: candidates.map((m) => m.id) };
    const recent = [...open].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((m) => m.id);
    return { lang, reply: Say.noOpenMatch(lang), refs: recent, nothingMatched: true };
  }

  function reopenFlow(norm, lang, memories) {
    const { sure, candidates } = pickOne(norm, memories.filter((m) => m.done));
    if (sure) return { lang, reply: Say.reopened(lang), reopen: [sure.id] };
    if (candidates.length) return { lang, reply: Say.whichOne(lang), refs: candidates.map((m) => m.id) };
    return { lang, reply: Say.notFound(lang) };
  }

  function answer(norm, lang, has, memories, now) {
    const q = contentTokens(norm);
    const wantDone = has(DONE_STATUS), wantOpen = has(PENDING);
    const day = parseDate(norm, now);
    const thisWeek = has(["this week", "या आठवड्यात", "ह्या आठवड्यात", "इस हफ्ते", "इस सप्ताह", "is hafte", "ya athvadyat"]);

    let pool = memories;
    if (wantDone) pool = pool.filter((m) => m.done);
    else if (wantOpen) pool = pool.filter((m) => !m.done);

    let dated = false;
    if (thisWeek) {
      const start = startOfDay(now), end = addDays(start, 7);
      pool = pool.filter((m) => m.due && fromYmd(m.due) >= start && fromYmd(m.due) < end);
      dated = true;
    } else if (day) {
      const isToday = sameDay(day, now), isPast = day < startOfDay(now);
      pool = pool.filter((m) => (m.due && sameDay(fromYmd(m.due), day)) || ((isToday || isPast) && sameDay(new Date(m.createdAt), day)));
      dated = true;
    }

    const byDue = (list) => [...list].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const da = a.due || "9999", db = b.due || "9999";
      return da !== db ? da.localeCompare(db) : b.createdAt.localeCompare(a.createdAt);
    });

    if (!q.length) {
      let list = pool;
      if (!wantDone && !dated) list = list.filter((m) => !m.done);
      list = byDue(list);
      const refs = list.slice(0, 20).map((m) => m.id);
      if (wantDone) return { lang, reply: Say.doneList(lang, list.length), refs };
      return { lang, reply: Say.openList(lang, list.length, dated), refs };
    }
    const hits = rank(q, pool);
    if (!hits.length) return { lang, reply: Say.notFound(lang) };
    const ordered = [...hits].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
    return { lang, reply: Say.found(lang, ordered.length), refs: ordered.slice(0, 15).map((m) => m.id) };
  }

  // ---------- Entry point ----------

  // opts.lang forces the reply language (e.g. Marathi heard through the Hindi recogniser).
  function respond(text, memories, now = new Date(), opts = {}) {
    const norm = normalize(text);
    const ws = words(norm);
    const wset = new Set(ws);
    const lang = opts.lang || detectLang(norm);
    const has = (list) => list.some((p) => (p.includes(" ") ? norm.includes(p) : wset.has(p)));
    const done = (plan) => Object.assign({ complete: [], reopen: [], refs: [] }, plan);

    if (ws.length && ws.length <= 4 && ws.every((w) => GREETINGS.has(w))) return done({ lang, reply: Say.greeting(lang) });
    if (ws.length <= 4 && has(THANKS)) return done({ lang, reply: Say.welcome(lang) });

    const rememberAtStart = REMEMBER.some((p) => norm.startsWith(p) || norm.startsWith("please " + p) || norm.startsWith("plz " + p));
    const explicitRemember = has(REMEMBER);
    const question = isQuestion(norm, ws);

    if (rememberAtStart || (explicitRemember && !question)) return done(save(text, norm, lang, now));
    if (has(DELETE)) return done({ lang, reply: Say.neverDelete(lang), refs: rank(contentTokens(norm), memories).slice(0, 5).map((m) => m.id) });
    if (has(REOPEN) && !question) return done(reopenFlow(norm, lang, memories));
    if (question) return done(answer(norm, lang, has, memories, now));
    if (has(DONE)) {
      const plan = completeFlow(norm, lang, memories);
      // "Submit the form on Friday" is a new task, not a finished one.
      const d = plan.nothingMatched ? parseDate(norm, now) : null;
      if (d && d >= startOfDay(now)) return done(save(text, norm, lang, now));
      delete plan.nothingMatched;
      return done(plan);
    }
    return done(save(text, norm, lang, now));
  }

  const Brain = { respond, normalize, words, tokens, key, translit, similarity, rank, contentTokens, detectLang, parseDate, ymd, fromYmd, startOfDay, dayName, LOCALE };
  if (typeof module !== "undefined" && module.exports) module.exports = Brain;
  root.Brain = Brain;
})(typeof globalThis !== "undefined" ? globalThis : this);
