# Moopit Tetris ♥

A quiet little Tetris gift for Kay ("Moopit"). Dark, calm, and soft by default, with a chill techno soundtrack
that is generated live in the browser. Works on a phone, works offline once opened.

Live at **https://tetris.moopit.fun**

## Features

- Classic 10×20 Tetris: all 7 pieces, SRS rotation and wall kicks, ghost piece, hold, next 5, soft + hard drop,
  lock delay, scoring, levels (speed rises every 10 lines), game over + Play Again
- Loving messages on line clears, Tetris (4 lines), level-ups and now and then at random
- Pause shows *"Take a rest, Moopit. I'll be right here."* (auto-pauses if the tab is hidden)
- Gentle sparkles on line clears, hearts on bigger clears
- Themes: dark (default), dark indigo, light, plus a high-contrast option. Settings can also turn Hold off and choose how many Next pieces show (all saved on the device)
- Techno audio (music + effects), toggled and volume-controlled independently
- Phone-friendly touch buttons, keyboard controls, installable PWA, offline after first load

## Run locally

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then builds to dist/
npm run preview    # serve the built site on http://localhost:4173
```

Keyboard: ← → move · ↑ / X rotate · Z rotate back · ↓ soft drop · Space hard drop · C / Shift hold ·
P / Esc pause · M music on/off.

## Deploy to AWS

Everything runs in **us-east-1** and is described by one CloudFormation template (`deploy/stack.yaml`):
a private S3 bucket, a CloudFront distribution (HTTPS, HTTP/2+3) reading it through Origin Access Control,
and the `tetris.moopit.fun` alias. There is no server and nothing to patch.

1. **Certificate (once).** Request an ACM certificate in **us-east-1** for `*.moopit.fun` with DNS validation.
   Add the one validation CNAME it shows you in Cloudflare as **DNS only** (grey cloud).
   Wait until its status is `ISSUED`. One wildcard covers every future `*.moopit.fun` site.
2. **Deploy.**
   ```
   CERT_ARN=arn:aws:acm:us-east-1:<account>:certificate/<id> npm run deploy
   ```
   That builds the site, creates/updates the stack, uploads the files, and invalidates CloudFront.
   It uses the AWS profile `bubbabright` unless you set `AWS_PROFILE`.
3. **DNS (once).** In Cloudflare add a CNAME `tetris` → the `d….cloudfront.net` name the script prints,
   **DNS only** (grey cloud).

To update the game later, just run step 2 again.

Tear down: empty the bucket, then `aws cloudformation delete-stack --stack-name moopit-tetris`.

## Change the personal messages

Everything Kay reads is in **`src/messages.ts`**: the note on the start screen (`START_NOTE`), the note on the
game-over screen (`END_NOTE`), the random encouragement, line-clear, Tetris and level-up messages, the pause message,
and the corner watermark. Change any of the text there, bump the version (see below), and redeploy.

## Change colours / theme

- Page colours (backgrounds, panels, accents) for dark, light and high-contrast: CSS variables at the top of `src/style.css`.
- Block colours and particle colours: `src/theme.ts`, one palette per mode.

## How the audio works

There are **no audio files**. `src/audio.ts` synthesises everything with the Web Audio API, so it works offline
and adds nothing to the download.

- **Music:** a 112 BPM chill-techno loop in A minor (Am – F – C – G). Soft four-on-the-floor kick, quiet hats and clap,
  a rolling filtered bass, a slow detuned pad, and a sparse plucked arpeggio with an echo. Tempo (`BPM`) and chords (`CHORDS`)
  are constants at the top of the file.
- **Effects:** short synth blips for move/rotate/hold, a soft thud for lock and hard drop, rising pentatonic arpeggios for
  line clears (longer for bigger clears), a chord sweep for a Tetris, and a falling tone for game over.
- **Mixer:** `master → musicGain / sfxGain`. Music and effects each have their own on/off and volume (⚙ menu). Music dips while paused.
- Browsers only allow sound after a tap, so audio starts when Kay presses **Play**.

Settings and best score are remembered on the device (`localStorage`, key `moopit-tetris:settings`).

## Versions and releases

The version lives in one place, `package.json`, and is shown at the bottom of the ⚙ settings panel.
Every release: bump `version` in `package.json`, add an entry to `CHANGELOG.md`, then `npm run deploy`.
Fixes bump the last number (1.2.**1**), new features the middle one (1.**3**.0). See [CHANGELOG.md](CHANGELOG.md).

## Project layout

```
src/engine.ts    game rules (no DOM, no audio)
src/render.ts    canvas drawing + particles
src/audio.ts     synthesised music and effects, saved settings
src/messages.ts  all the words        ← edit me
src/theme.ts     block colours        ← edit me
src/style.css    page colours + layout
src/App.tsx      screens, input, game loop
public/          manifest, service worker (offline), icons
deploy/          CloudFormation stack + deploy script
```

## Next session

- Add a **leaderboard**.
- Ask for the player's **name at the start** of a game (used for leaderboard entries).
