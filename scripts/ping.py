#!/usr/bin/env python3
"""
Preflight Telegram pinger. Runs every 30 min from GitHub Actions.

Each run looks at the 30-minute slot it belongs to (Melbourne time) and sends
one message covering whatever is due in that slot:
  - morning brief (08:30 slot)
  - push-up set (on the hour, skipped during shifts / gym / before upper days)
  - walk block start
  - gym heads-up (30-60 min before the session)

Env:
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   required unless DRY_RUN=1
  APP_URL            optional; defaults to https://<owner>.github.io/<repo>/
  PREFLIGHT_AT       optional "YYYY-MM-DD HH:MM" to simulate a slot (testing)
  PREFLIGHT_MODE     "slot" (default) or "test" (sends a hello message)
  DRY_RUN=1          print instead of sending
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, date, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
PLAN = json.loads((ROOT / "plan.json").read_text())
TZ = ZoneInfo(PLAN["timezone"])


# ---------- schedule logic (mirrors logic.js) ----------
def to_min(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def fmt_min(m):
    """12-hour clock: 9am, 4:30pm, 12pm."""
    h, mm = (m // 60) % 24, m % 60
    h12 = 12 if h % 12 == 0 else h % 12
    return f"{h12}{f':{mm:02d}' if mm else ''}{'am' if h < 12 else 'pm'}"


def fmt_time(hhmm):
    return fmt_min(to_min(hhmm))


def entry(key):
    return PLAN["schedule"].get(key, {"session": "rest"})


def busy_ranges(key, session):
    e = entry(key)
    out = []
    if e.get("shift"):
        s, t = e["shift"]
        out.append({"kind": "shift", "from": to_min(s) - PLAN["shiftBufferBefore"], "to": to_min(t) + PLAN["shiftBufferAfter"]})
    if session != "rest":
        g = to_min(e.get("gym", PLAN["defaultGym"]))
        out.append({"kind": "gym", "from": g, "to": g + PLAN["gymMinutes"]})
        if session == "upper":
            out.append({"kind": "pre-upper", "from": g - PLAN["pushups"]["upperBlockBefore"], "to": g})
    return out


def inside(m, r):
    return r["from"] <= m < r["to"]


def overlaps(a, b):
    return a["from"] < b["to"] and b["from"] < a["to"]


def pushup_hours(key, session):
    cfg = PLAN["pushups"]
    busy = busy_ranges(key, session)
    return [h for h in range(cfg["firstHour"], cfg["lastHour"] + 1) if not any(inside(h * 60, r) for r in busy)]


def walks_for(key, session):
    busy = busy_ranges(key, session)
    gym = next((b for b in busy if b["kind"] == "gym"), None)
    out = []
    for w in PLAN["walks"]:
        r = {"from": to_min(w["time"]), "to": to_min(w["time"]) + w["minutes"]}
        if any(b["kind"] == "shift" and overlaps(r, b) for b in busy):
            continue
        w = dict(w)
        if gym and overlaps(r, {"from": gym["from"] - 30, "to": gym["to"]}):
            w["label"] = PLAN["gymWalkLabel"]
            w["atGym"] = True
        out.append(w)
    return out


# ---------- messages ----------
PUSH_LINES = [
    "Floor. Now.",
    "Clean reps, full lockout.",
    "Chest to the floor, every rep.",
    "Quick set, back to it.",
    "Same target as the app says. No ego reps.",
    "Brace your core, elbows at 45.",
]


def app_url():
    if os.environ.get("APP_URL"):
        return os.environ["APP_URL"]
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        owner, name = repo.split("/", 1)
        return f"https://{owner.lower()}.github.io/{name}/"
    return ""


def compose(now):
    """Return message text for the 30-minute slot containing `now`, or None."""
    key = now.date().isoformat()
    start, end = date.fromisoformat(PLAN["start"]), date.fromisoformat(PLAN["end"])
    if not (start <= now.date() <= end):
        return None

    e = entry(key)
    session = e.get("session", "rest")
    title = PLAN["sessions"][session]["title"]
    gym_at = e.get("gym", PLAN["defaultGym"])
    slot = now.hour * 60 + (30 if now.minute >= 30 else 0)
    hours = pushup_hours(key, session)
    parts = []

    # Morning brief
    if slot == to_min("08:30"):
        day_no = (now.date() - start).days + 1
        total = (end - start).days + 1
        left = (date.fromisoformat(PLAN["route"]["departure"]) - now.date()).days
        lines = [f"<b>Day {day_no} of {total}</b> · {left} day{'s' if left != 1 else ''} to PVG"]
        lines.append(f"Gym: {title} at {fmt_time(gym_at)}" if session != "rest" else "Gym: rest day")
        if e.get("shift"):
            lines.append(f"Shift: {fmt_time(e['shift'][0])}–{fmt_time(e['shift'][1])}")
        lines.append(f"Push-up sets today: {len(hours)} (first at {fmt_min(hours[0] * 60)})" if hours else "No push-up sets today")
        parts.append("\n".join(lines))

    # Push-up set
    if now.minute < 30 and now.hour in hours:
        n = hours.index(now.hour) + 1
        line = PUSH_LINES[(now.day + now.hour) % len(PUSH_LINES)]
        tail = " Last one today." if n == len(hours) else ""
        parts.append(f"<b>{fmt_min(now.hour * 60)} · Push-ups</b>\nSet {n} of {len(hours)}. {line}{tail}")

    # Walk block starting in this slot
    for w in walks_for(key, session):
        m = to_min(w["time"])
        if slot <= m < slot + 30 and not w.get("atGym"):
            parts.append(f"<b>{fmt_time(w['time'])} · {w['label']}</b>\n{w['minutes']} min on the pad, about {w['minutes'] * 100:,} steps.")

    # Gym heads-up, 30-60 min ahead
    if session != "rest":
        g = to_min(gym_at)
        if slot + 30 < g <= slot + 60:
            extra = " Incline treadmill there counts as a walk block." if any(w.get("atGym") for w in walks_for(key, session)) else ""
            parts.append(f"<b>Gym at {fmt_time(gym_at)} · {title}</b>\n{PLAN.get('gymName', 'Gym')}. Log it in the app after.{extra}")

    if not parts:
        return None
    url = app_url()
    if url:
        parts.append(f'<a href="{url}">Open Preflight</a>')
    return "\n\n".join(parts)


def send(text):
    if os.environ.get("DRY_RUN") == "1":
        print("---- DRY RUN ----\n" + text)
        return
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat = os.environ["TELEGRAM_CHAT_ID"]
    data = urllib.parse.urlencode({
        "chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "true",
    }).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data)
    with urllib.request.urlopen(req, timeout=20) as r:
        body = json.loads(r.read())
    if not body.get("ok"):
        sys.exit(f"Telegram error: {body}")
    print("sent")


def main():
    mode = os.environ.get("PREFLIGHT_MODE", "slot")
    at = os.environ.get("PREFLIGHT_AT", "").strip()
    now = datetime.strptime(at, "%Y-%m-%d %H:%M").replace(tzinfo=TZ) if at else datetime.now(TZ)

    # GitHub's scheduler can run late. Snap back to the slot this cron was meant for:
    # the ":02" cron is the top-of-hour slot, the ":32" cron is the half-hour slot.
    sched = os.environ.get("SCHEDULE", "")
    if not at and sched.split(" ")[0] in ("2", "32"):
        minute = 0 if sched.startswith("2 ") else 30
        snapped = now.replace(minute=minute, second=0, microsecond=0)
        if snapped > now:
            snapped -= timedelta(hours=1)
        now = snapped

    if mode == "test":
        msg = compose(now) or "(nothing due in this slot)"
        send("<b>Preflight is wired up.</b>\nHere's what this slot would send:\n\n" + msg)
        return

    msg = compose(now)
    if msg:
        send(msg)
    else:
        print(f"nothing due at {now:%Y-%m-%d %H:%M %Z}")


if __name__ == "__main__":
    main()
