# Cursor local setup

Use this page for a source checkout you want to exercise inside Cursor. It
covers the free engines `rea doctor` lists, the Cursor skill, and the user-level
MCP registration. `rea setup` remains the only supported way to write that
registration. The helper below does not install Java, Hopper, or IDA, and setup
does not run it.

## Install the toolchain and free engines

Use the Node.js release in `.nvmrc` and the npm release in
`package.json#packageManager`. Then install dependencies and the runtime:

```bash
nvm install
nvm use
npm ci
npm run build:cached
```

Install a full JDK 21 or newer yourself, including `javac` and the
`jdk.compiler` module. On Ubuntu that is the `openjdk-21-jdk` package. The
helper refuses to install Java.

From the repository root, download Ghidra 12.1.4, the pinned
jadx-headless-mcp 0.7.1 JAR, and the Apache-2.0 Appium ApiDemos sample APK.
The script checks the published digests and skips files that already match:

```bash
node scripts/install-free-analysis-engines.mjs
set -a
. "$HOME/.local/share/rea/cursor-engines.env"
set +a
```

`REA_FREE_ENGINES_DIR` selects another destination. The default is
`$HOME/.local/share/rea`. The env file exports `GHIDRA_INSTALL_DIR`,
`JAVA_HOME`, and `REA_JADX_MCP_JAR`. Its comment records the sample APK path.

## Register REA with Cursor

Review the plan, then approve the same scope:

```bash
node scripts/rea.mjs setup --client cursor --dry-run
node scripts/rea.mjs setup --client cursor --yes
```

Setup writes `~/.cursor/mcp.json`, keeps unrelated MCP servers, and installs
the skill under `~/.agents/skills/reverse-engineer-anything`. With the
variables above in the environment, the Cursor entry records
`GHIDRA_INSTALL_DIR`, `JAVA_HOME`, and `REA_JADX_MCP_JAR`. Restart Cursor after
setup.

[cursor-mcp.example.json](examples/cursor-mcp.example.json) shows that shape
with placeholders. Prefer the file setup writes. Do not commit a filled
`mcp.json`; the paths belong to one machine.

Check readiness and the registration:

```bash
node scripts/rea.mjs doctor --json
```

`healthy: true` means Node, the host, the installed skill, the Cursor
registration, and at least one configured provider are ready. Hopper and IDA
remain `missing_analysis_engine` until you configure them. That does not by
itself make the report unhealthy when Ghidra or JADX is available.

To confirm the registered command, start the server from `~/.cursor/mcp.json`
and send an MCP `initialize` request. The server identifies itself as `rea`.

## Try each free engine

Static JavaScript needs no external engine. Point it at a directory that
contains `package.json` and a script:

```bash
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/app --format json
```

For a website, start a separate Chrome profile with a loopback debugging port,
as described in [browser observation](browser-observation.md#start-a-browser).
Then list targets and inspect one page:

```bash
node scripts/rea.mjs list-browser-targets http://127.0.0.1:9222 --format json
node scripts/rea.mjs inspect-web-page http://127.0.0.1:9222 TARGET_ID --format json
```

For the sample APK:

```bash
node scripts/rea.mjs inspect-android-package "$HOME/.local/share/rea/android/ApiDemos-debug.apk" --format json
node scripts/rea.mjs inspect-android-method \
  "$HOME/.local/share/rea/android/ApiDemos-debug.apk" \
  io.appium.android.apis.ApiDemos onCreate --format json
```

For a small native binary, compile a C program and decompile one function with
Ghidra. The first launch imports the program and waits for auto-analysis:

```bash
gcc -O0 -g -o /tmp/rea-add add.c
node scripts/rea.mjs decompile /tmp/rea-add add_numbers --provider ghidra --format json
```

## Hopper and IDA

Hopper and IDA are proprietary. This helper does not download or install them.

Hopper has a Linux demo that does not need a paid license, and a paid macOS
application. Setup can install the Linux demo only after you approve that
separate step with `--install-hopper`. macOS still needs Hopper's first-run
choice in the same user session. An existing installation can be selected with
`HOPPER_LAUNCHER_PATH`. See [Hopper](installation.md#hopper).

IDA needs your own IDA installation and the upstream IDA MCP registration.
Point `REA_IDA_MCP_CONFIG` at that JSON. See [IDA](ida-provider.md).

JEB is also a separate commercial product. Doctor mentions it only after you
set `REA_JEB_MCP_URL`. See [JEB](jeb-analysis.md).
