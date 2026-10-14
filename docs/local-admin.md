# Local admin

This page is the English setup for the loopback admin that
[Análise local](analise-local.md) describes in Portuguese. It runs on your
machine, without Cursor, Claude, or any other model. It is not a hosted
service, and it does not add accounts, billing, or multiple tenants. The REA
CLI and MCP server stay as they are. The script only calls the CLI that
already exists.

The public site in `website/` does not include this page. The HTML lives in
`scripts/local-analyze-dashboard.html` and is served only when you ask.

## Open the page

From the repository root, with dependencies installed and the runtime built
(`npm ci` and `npm run build:cached`):

```bash
npm run analyze -- --serve
```

Open the address the command prints. The default port is `4174`. The process
listens on `127.0.0.1` only.

Sign in with `REA_ADMIN_USER` (default `admin`) and `REA_ADMIN_PASSWORD`. If
no password is set the first time, the process prints one password on stderr
and stores only a hash. Copy `docs/examples/rea-admin.env.example` to `.env`
in the repository root or to `~/.local/share/rea/admin.env`. Do not commit a
real password.

## What the screens do

- **Home.** Ghidra, JADX, Rizin, and Frida presence, plus `rea doctor`. Frida
  is not started. The queue and recent analyses are on the same screen.
- **New analysis.** Paste a local path or `https://github.com/org/repo`. Leave
  the type on Detect, or pick JavaScript, Android, native, a static site, or
  .NET. One analysis runs at a time. The rest wait in the queue.
- **History.** Live progress and the log. Cancel stops the running child
  process. Run again starts a new job with the same target and type.
- **Result.** Architecture map, OpenAPI document or the empty stub, codebase
  overview, layperson notes in Portuguese and English, and the engine JSON.
  The text is filled from files and CLI JSON. A missing field stays missing.
- **Library.** Saved targets. The first run seeds the Appium ApiDemos
  repository and the pinned ApiDemos 6.0.18 APK. That APK URL is the only
  remote file the page downloads, and the SHA-256 is checked before analysis.
- **Settings.** Engine paths, report folder, and default language. Paths apply
  only to the REA child process. They do not change your shell `PATH`. An
  empty report folder falls back to `--output` or `REA_ANALYZE_OUTPUT`.
- **Users and audit.** Administrators create operators, change passwords, and
  disable accounts. The environment admin cannot be deleted or disabled, and
  the last active administrator stays. The audit log records who signed in and
  who ran, cancelled, or changed something. Passwords are not written there.

Light and dark follow the saved theme. The language control switches the page
and the default used after the next sign-in.

## ZIP and the script token

Open an analysis and use the ZIP link. The archive is the job folder without
`node_modules` or `.git`, with a size cap. Individual package files also open
from the result.

Set `REA_ADMIN_TOKEN` to at least 16 characters, then restart the page. A
script can start an analysis. The token cannot create users or change engine
paths.

```bash
curl -sS -X POST http://127.0.0.1:4174/api/analyze \
  -H "Authorization: Bearer $REA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"target":"/absolute/path/to/the/app","kind":"auto"}'
```

`REA_ADMIN_DIR` chooses where users, settings, targets, and the audit log are
stored. The default is `~/.local/share/rea/admin`.

## What does not change

`npm start` is still the stdio MCP server. `rea setup` does not open this
page. A separate product, if you build one, belongs in another repository.
