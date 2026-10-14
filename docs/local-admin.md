# Local admin

This page is the English setup for the loopback admin that
[Análise local](analise-local.md) describes in Portuguese. It runs on your
machine, without Cursor, Claude, or any other model. It listens on
`127.0.0.1` unless you bind another address for a reverse proxy. There is no
billing or checkout. There are users and roles. The REA CLI and MCP server
stay as they are. The script only calls the CLI that already exists.

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

## Extra local tools

The same loopback process, still with no model, can:

- Diff two finished jobs: `hashes.sha256`, `strings.txt`, and OpenAPI paths. Added and removed lines are capped.
- Repeat a saved target every N minutes (15 minimum) while the page process stays up. The timer stops when the process stops. A webhook and an audit row are written only when the manifest SHA-256 changes. The first run only stores the digest.
- Queue with low, normal, and high priority. A running job is not preempted. `nice` 0–19 is applied to the child when the `nice` binary exists and the sandbox is off. Without the sandbox, a RAM number is only shown. With `REA_SANDBOX=1`, the default mode is isolate (`unshare`, `taskset`, `prlimit`). `REA_SANDBOX_MODE=docker` uses `--memory` and `--cpus`.
- Write `hashes.sha256` for the evidence files. When the local admin secret has at least 16 characters, `signature.txt` is an HMAC-SHA256 of that manifest. It is a local integrity tag, not a public code-signing certificate.
- Show an observation checklist with green, amber, and red. Red is an engine step that failed. Routes, Android permission names, and `http://` URLs are copied from files already on disk. This is not an OWASP certificate and it does not mean the program is safe.
- Search `.txt`, `.json`, and `.md` evidence for strings, routes, and `android.permission` names.
- Export client, internal, and CTF PDFs. The CTF template does not invent a flag or a solution. The font covers common Portuguese letters; other characters become `?`.
- POST an optional webhook when a manual job finishes. Discord hosts receive `{content}`. `api.telegram.org` receives `{text}` plus `chat_id` when that field is set. Any other `http` or `https` URL receives `{event, job}`. The audit log stores the HTTP status, not the URL. A Telegram bot token lives in the path; do not commit it.
- Mint a read-only `/r/<token>` link for about seven days. The token is the read capability. By default the page listens on 127.0.0.1. If you publish the page, anyone with the token can read that report.
- Export and import engine configuration. Keys outside the engine list, including `PATH` and `LD_PRELOAD`, are dropped.
- Run a fast mode for JavaScript and static sites. That mode does not call Ghidra or JADX. For an APK, a native file, or .NET it records a skip and does not call those engines.

The sandbox starts off on this computer. Turn it on with `REA_SANDBOX=1` or the admin setting. When it is on, the default mode is isolate: no network, with `taskset` and `prlimit`. If `unshare`, `prlimit`, or `taskset` is missing, the analysis does not run on the host. `REA_SANDBOX_MODE=docker` uses the image described in `deploy/Dockerfile.sandbox`, with `--memory` and `--cpus`. The production image in `deploy/Dockerfile` turns isolate on and includes Ghidra, JADX, Rizin, Apktool, and Frida tools. The Frida step only lists devices. Apktool decodes the manifest and strings and does not emit smali.

APK and binary uploads land in `output/uploads/<user>/`, with a size cap and a content check. API role `user` is stored as a non-admin user. An administrator sees every analysis. Another user gets 404 for someone else's analysis. `GET /api/health`, `GET /api/openapi.json`, and `GET /api/docs` describe the API. `REA_DEMO=1` allows only an upload, GitHub, or the pinned APK.

## License and hosting without billing

This is not legal advice. It only points at files in this repository.

REA's own `LICENSE` is MIT, Copyright (c) 2026 morluto. That license allows use, copying, modification, merging, publishing, distribution, sublicensing, and selling copies, if the copyright and permission notices stay with the software. There is no warranty. MIT alone does not forbid charging for a service built from REA's code. It also does not license Ghidra, JADX, Frida, GDB, Rizin, IDA, Hopper, or JEB.

`THIRD_PARTY_NOTICES.md` says to verify permissions before publishing analysis output, sharing tool access, or operating a service. A summary does not interpret a contract. An IDA API does not grant hosting or extra-user rights. JEB's published EULA restricts public disclosure of decompiled code, reconstructed artifacts, and analysis reports unless the edition permits it.

Ghidra, JADX, jadx-headless-mcp, and Apktool are recorded as Apache-2.0. Redistributing those binaries means keeping LICENSE and NOTICE. Ghidra also contains GPL modules; the top-level notice does not replace a full distribution's notices. GDB is GPL-3.0-or-later: invoking a binary that is already installed is not, by itself, distributing it; distributing the binary or linking it into a product does trigger copyleft. Frida is LGPL-2.0 with the WxWindows exception. That exception covers some binary-object distributions under your own terms. It does not decide a multi-tenant service. IDA, Hopper, and JEB are proprietary tools. REA does not grant those licenses.

Rizin and GhidraMCP are not in the repository license table. From that inventory the answer is `NOT_ENOUGH_INFO`. A caller-supplied OpenJDK is GPLv2 with the Classpath exception. Node.js is MIT.

This page can be published behind a proxy, with no plans, billing, Stripe, or checkout. That does not grant IDA, Hopper, or JEB rights, and it does not relicense GPL or LGPL pieces. Rizin and GhidraMCP remain outside the table (`NOT_ENOUGH_INFO`).

## What does not change

`npm start` is still the stdio MCP server. `rea setup` does not open this
page. There is no checkout. Optional deploy notes are in `deploy/README.md`.
