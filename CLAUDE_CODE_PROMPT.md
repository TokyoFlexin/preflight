I've got a finished app in `~/Downloads/preflight.zip`. Please ship it to GitHub Pages and wire up the Telegram pings. Don't change the app code unless something is actually broken, and tell me if you do.

1. **Unzip** it to `~/Projects/preflight` (it contains a `preflight/` folder). Run `node tests/logic.test.js` and make sure it passes.

2. **Repo**: create a **public** GitHub repo called `preflight` with `gh` (it needs to be public for free Pages). Init git, commit everything, and push to `main`.

3. **Pages**: turn on GitHub Pages from `main` at the root, e.g. `gh api -X POST repos/{owner}/preflight/pages -f "source[branch]=main" -f "source[path]=/"`. Wait for the first build, then open the URL with curl and confirm `index.html`, `plan.json` and `sw.js` all return 200.

4. **Telegram bot token**: I already have a Telegram bot from an earlier setup with you, possibly Claude Code's Telegram channel plugin. Look for the existing token, for example in `~/.claude/channels/telegram/.env`. If you can't find one, walk me through making a new bot with @BotFather. **Never print the token in chat or commit it.**

5. **Chat ID**: find my chat ID. Check the Telegram channel plugin's access/allowlist file first. Otherwise ask me to send the bot a message, then read it from `getUpdates`. If the Claude Code Telegram channel is running, it may be consuming the updates, so stop it first.

6. **Secrets**: `gh secret set TELEGRAM_BOT_TOKEN` and `gh secret set TELEGRAM_CHAT_ID`. Pipe the values in, don't echo them.

7. **Test**: run `gh workflow run ping.yml -f mode=test -f "at=2026-11-13 12:00"`, watch it with `gh run watch`, and confirm with me that the Telegram message arrived. It should show a push-up set and a gym heads-up for 1pm.

8. **Done**: send me the Pages URL. Remind me to open it in Safari on my iPhone, then Share → Add to Home Screen.
