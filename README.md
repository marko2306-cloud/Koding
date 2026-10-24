# CueCast — browser teleprompter

A teleprompter for TikTok, Reels, YouTube and Zoom, built as **one self-contained file**: `index.html`.
It has no dependencies and no build step, and it works offline once loaded. Voice-follow in Chrome needs internet because Chrome uses Google's speech service.

- **Free:** fixed-speed scrolling (60–220 true WPM), 1 saved script, watermarked recordings
- **Pro ($6/mo or $39 lifetime):** voice-follow scrolling, unlimited scripts, recordings with no watermark

## Deploy (free)

**Cloudflare Pages:** create a project, connect this repo (or drag-and-drop the folder), set no build command, and set the output directory to `/`.
**Netlify:** drag the folder onto app.netlify.com/drop, or connect the repo with no build command.

You need HTTPS for the camera, the microphone and the license-key check. Both hosts give you HTTPS automatically.

## Before you go live

### 1. Create your own license signing key (required)

```bash
node tools/keygen.mjs init --force
```

This creates `tools/private-key.json` (git-ignored) and writes the matching public key into `index.html`.
**Back up the private key and never commit or share it.** Anyone who has it can make Pro keys.
The public key currently in `index.html` came from a dev key pair that lived only in a temporary build container, so nobody can issue keys for it. You have to run `init`.

### 2. Add Stripe Payment Links

Create two Payment Links in Stripe: $6/month recurring and $39 one-time. Paste them into `CONFIG` near the top of the `<script>` in `index.html`:

```js
const CONFIG = { stripeMonthly: 'https://buy.stripe.com/...', stripeLifetime: 'https://buy.stripe.com/...', supportEmail: 'you@example.com' };
```

While these are empty, the Buy buttons show a note that payments are not switched on yet. They never open a broken checkout.

### 3. Issue keys to buyers

```bash
node tools/keygen.mjs lifetime          # lifetime key
node tools/keygen.mjs monthly 35        # key valid for 35 days (re-issue on each renewal)
node tools/keygen.mjs verify CC-L-...   # check a key
```

Send the buyer the key, or a one-click activation link: `https://your-site/?key=CC-L-...`

## How the license check works

Keys are **ECDSA P-256 signatures**. The page holds only the public key and checks each signature with WebCrypto.
You can't make a valid key without the private key. Repeated characters, random strings and edited real keys (signature, ID, plan or expiry changed) all fail.
Without accounts, a few limits are unavoidable:

- Keys are checked offline. A monthly key carries an expiry date, so in v1 you re-send a key on each renewal. Cancelled subscriptions simply aren't renewed.
- Anyone who edits the page's JavaScript in their own browser can bypass any client-side check. Stopping that would need a server.

## How the speed works

Scroll position is tracked in **words**, not pixels. Each frame advances `wpm / 60000` words per millisecond, and the pixel offset comes from the measured line positions.
Changing the text size re-measures the lines but leaves the word position and the rate alone, so reading time is `words ÷ WPM` at any size.

## Voice-follow rules

These live in `VoiceMatcher` and `VoiceFollow` in `index.html`:

- It advances only on the exact next script word. A 1-letter mishearing is tolerated on words of 4+ letters.
- It skips at most 2 words, and only on final results when the next spoken word confirms the skip.
- It looks at no more than 5 words per recognition result.
- On interim results it never skips, and it ignores the last word, which is still changing.
- It never moves backwards on its own. The reader can tap a word, or press "↓ line", to re-sync.

## Browser notes (also stated on the site)

- Voice-follow works best in Chrome (desktop and Android).
- Safari's recognition is limited, and that includes every iPhone browser.
- Firefox has no speech recognition, so CueCast falls back to fixed speed and says so.
- Recording uses `MediaRecorder`: MP4 where the browser supports it (Safari, recent Chrome), WebM otherwise.
- Using the mic for voice-follow and recording at the same time works on desktop Chrome. Some Android phones won't let two features use the mic at once.
- The screen wake lock needs iOS 16.4+ or Chrome 84+. The prompter shows whether it worked.
