# Aathvan (आठवण): offline web app for iPhone

Chat or talk to it in English, मराठी or हिंदी to remember things. Ask it later, and tick things off when they're done. Nothing is ever deleted. Once installed it works with no internet, and it never expires.

Your notes are stored only on your phone. Putting the app online shares the app's code, never your notes.

## 1. Put it online (one time, free)

The easiest way is GitHub Pages:

1. Go to **github.com** and create a free account.
2. Click **+ → New repository**. Name it `aathvan`, choose **Public**, and click **Create repository**.
3. On the next page, click **uploading an existing file**. Drag in everything from this folder **except** `test` and `README.md`:
   `index.html`, `app.js`, `brain.js`, `style.css`, `sw.js`, `manifest.webmanifest`, and the `icons` folder.
   Then click **Commit changes**.
4. Open the repository's **Settings → Pages**. Under **Branch**, choose `main` and `/ (root)`, then click **Save**.
5. Wait about a minute. Your app is now at `https://YOUR-USERNAME.github.io/aathvan/`.

## 2. Install it on your iPhone

1. Open that link in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Open Aathvan once from the new icon while you're online. After that it works offline.

## Voice chat

- Tap the **blue mic** next to the message box.
- Pick **मराठी / हिंदी / English** at the top, speak, and pause. It saves or answers, and can read the reply aloud (you can turn that off).
- **Dictation must be on:** Settings → General → Keyboard → Enable Dictation. Allow the microphone when asked.
- **Marathi voice:** iPhone has no Marathi speech recognition, so Aathvan brings its own. It runs [AI4Bharat's IndicConformer](https://github.com/AI4Bharat/IndicConformerASR) Marathi model on the phone.
  - The first time you tap मराठी, it asks to download the model once (about 200 MB). Use Wi-Fi.
  - After that, Marathi voice works offline, and nothing you say leaves the phone.
  - Tested on real Marathi recordings (Google FLEURS), it got about 82% of words exactly right. Most of the rest were spelling variants (पोलिस/पोलीस, सतरा/१७).
- **Hindi and English voice** use Apple's speech recognition, which may need internet. Typing always works offline.
- **Model source:** the model is downloaded from Hugging Face ([yashwantraoraut/indic-conformer-marathi-onnx](https://huggingface.co/yashwantraoraut/indic-conformer-marathi-onnx)). Once downloaded, the copy on the phone keeps working even if that page changes.
- **If the mic doesn't respond from the home-screen icon:** open the same link in Safari and use voice there. Both share the same notes.

## Keep a backup

Go to **List → Save a backup copy** and save the file to Files or iCloud Drive.

On a new phone, use **List → Restore from a backup**. Restoring only adds notes; it never changes or removes anything.

## Updating the app later

Upload the changed files to the same GitHub repository. The phone picks up the new version the next time it opens the app while online. Your notes are not touched.

## For developers

- `marathi-asr.js`: audio features (NeMo log-mel) and CTC decoding for the Marathi model. `marathi-voice.js`: model download and caching, recording, and silence detection. `vendor/`: onnxruntime-web 1.22.0 (MIT licence).
- `brain.js`: the rules brain (intents, transliteration, fuzzy matching, dates, replies). It works in the browser and in Node.
- Run the tests: `TZ=Asia/Kolkata node --test test/brain.test.js`
- Run it locally: `python3 -m http.server 8765` from this folder, then open http://localhost:8765
