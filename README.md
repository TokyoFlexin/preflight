# Preflight

An 18-day sprint to departure (MEL → PVG, 27 Nov 2026): 10k steps, hourly push-ups with an adaptive target, and a gym split planned around work shifts. It's a home-screen web app on GitHub Pages, with Telegram pings from GitHub Actions.

## What's in here

| Path | What it does |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app. Your log is stored on your phone (localStorage) |
| `logic.js` | Pure logic: the adaptive target, push-up hours, walk blocks. Shared by the app and the tests |
| `plan.json` | **Single source of truth**: dates, gym sessions, gym times, shifts, walk blocks, push-up rules |
| `scripts/ping.py` | Composes and sends the Telegram message for each 30-minute slot |
| `.github/workflows/ping.yml` | Runs the pinger at :02 and :32, 8am–11:30pm Melbourne time |
| `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/` | Offline support and home-screen install |
| `tests/logic.test.js` | `node tests/logic.test.js` |

## How the push-up target adapts
- You start at 20 a set.
- **Hit the target 3 sets in a row:** it goes up by 2, capped at 30.
- **Miss:** the next target meets you halfway. For example, target 20, did 14, next target is 17.
- **Skipped hours** don't count against you.
- **Sore joints:** the target drops to 60% straight away. You can tap it again to undo, as long as you haven't logged a set since.

## Push-up and walk scheduling
- **Push-up sets** fall on the hour from 09:00 to 23:00. Hours are skipped during:
  - a shift, plus 30 min before and 15 min after for travel
  - a gym session (90 min)
  - the 3 hours before an upper-body session
- **Walk blocks** that clash with a shift are dropped. A block next to a gym session becomes "Incline treadmill at the gym".

## Changing the plan
Edit `plan.json` and push. Times in that file are written as 24-hour (e.g. `16:30`), but the app and the pings always show them as 12-hour. The app and the pings both read it, so they stay in sync. Changing today's session in the app's dropdown only changes what the app shows; the pings still follow `plan.json`.

## Telegram setup
Add two repo secrets: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. You can also set a repo variable `APP_URL`; it defaults to `https://<owner>.github.io/<repo>/`.

To test, go to **Actions → Telegram pings → Run workflow**. Choose mode `test` and, optionally, a time like `2026-11-13 12:00`.

GitHub's scheduler sometimes runs late. The pinger snaps back to the slot it was meant for, so the message is still correct, just a bit late.

## After the sprint
The pinger stops sending after `end` (26 Nov). To stop the runs completely, disable the workflow: Actions → Telegram pings → ⋯ → Disable workflow.
