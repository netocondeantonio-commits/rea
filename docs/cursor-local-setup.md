# Cursor local setup

Use this page for a source checkout you want to exercise inside Cursor. It
covers the free engines and complementary tools mapped for that checkout, the
Cursor skill, and MCP registration. `rea setup` remains the only supported way
to write the user-level registration. The helper below does not install Java,
Hopper, or IDA, and setup does not run it.

The mapped projects and what this checkout does with each one are listed in
[Complementary reverse-engineering tools](awesome-ai-reverse-engineering.md).

## Install the toolchain and free engines

Use the Node.js release in `.nvmrc` and the npm release in
`package.json#packageManager`. Put that Node first on `PATH`. Then install
dependencies and the runtime:

```bash
nvm install
nvm use
npm ci
npm run build:cached
```

Install a full JDK 21 or newer yourself, including `javac` and the
`jdk.compiler` module. On Ubuntu that is the `openjdk-21-jdk` package. The
helper refuses to install Java.

From the repository root, download the free engines. The script checks the
published digests and skips files that already match:

```bash
node scripts/install-free-analysis-engines.mjs
set -a
. "$HOME/.local/share/rea/cursor-engines.env"
set +a
```

`REA_FREE_ENGINES_DIR` selects another destination. The default is
`$HOME/.local/share/rea`. The env file matches
[cursor-engines.env.example](examples/cursor-engines.env.example). It exports:

| Variable                   | What it points at                              |
| -------------------------- | ---------------------------------------------- |
| `GHIDRA_INSTALL_DIR`       | Extracted NationalSecurityAgency/ghidra 12.1.4 |
| `JAVA_HOME`                | The full JDK already on `PATH`                 |
| `REA_JADX_MCP_JAR`         | 1013503897/jadx-headless-mcp 0.7.1             |
| `REA_RIZIN_COMMAND`        | rizinorg/rizin 0.9.1 static Linux x64 binary   |
| `REA_OBJDUMP_COMMAND`      | GNU objdump from `binutils`                    |
| `REA_GDB_COMMAND`          | GNU GDB                                        |
| `GHIDRA_MCP_BIN`           | `ghidra-mcp` from the checkout virtualenv      |
| `GHIDRA_MCP_EXTENSION_ZIP` | LaurieWired/GhidraMCP 2.0 extension zip        |
| `GHIDRA_MCP_SERVER`        | `http://127.0.0.1:8080/`                       |

Comments in that file record the sample APK, the skylot/jadx 1.5.6 CLI, and
the Frida CLI. On Linux x64 the helper also links `jadx`, `rizin`, `frida`,
and `ghidra-mcp` into `~/.local/bin` and, when `sudo` is available,
`/usr/local/bin`. Other platforms still need those commands on `PATH`; the
pinned Rizin archive is the Linux x64 static build. `objdump` and `gdb` are
installed with `apt` only when they are missing on Linux.

The Python virtualenv at `$HOME/.local/share/rea/venv` installs
`frida==17.23.2`, `frida-tools==14.11.0`, and
`ghidra-mcp[headless]` from LaurieWired/GhidraMCP tag `2.0`. Headless mode
needs Python 3.10–3.13. REA does not install `frida-server` on a target.

## Register REA and GhidraMCP with Cursor

This checkout commits `.cursor/mcp.json`. Cursor does not expand `$HOME` in
that file, so both servers start through `scripts/cursor-mcp-launch.mjs`. The
launcher reads `~/.local/share/rea/cursor-engines.env` (or
`REA_CURSOR_ENGINES_ENV`) and does not use a shell.

- `rea` runs `scripts/rea.mjs mcp` with the same Node executable that started
  the launcher.
- `ghidra` runs `ghidra-mcp --ghidra-server http://127.0.0.1:8080/`. That
  server is the GUI bridge. It waits until the Ghidra plugin is listening. It
  does not import a binary by itself.

Review setup, then approve the same scope:

```bash
node scripts/rea.mjs setup --client cursor --dry-run
node scripts/rea.mjs setup --client cursor --yes
```

Setup writes `~/.cursor/mcp.json`, keeps unrelated MCP servers, and installs
the skill under `~/.agents/skills/reverse-engineer-anything`. With the
variables above in the environment, the user-level `rea` entry records the
provider environment doctor reports, including `GHIDRA_INSTALL_DIR`,
`JAVA_HOME`, and `REA_JADX_MCP_JAR` when those checks pass. Restart Cursor
after setup.

[cursor-mcp.example.json](examples/cursor-mcp.example.json) shows that
absolute shape with placeholders. Prefer either the committed project file or
the file setup writes. If both define a server named `rea`, keep one of them
enabled. Cursor can load both and then the two registrations compete.

GhidraMCP's GUI plugin is separate from REA's own headless Ghidra bridge.
After the helper extracts the extension zip:

1. Start Ghidra.
2. Choose `File` → `Install Extensions`, add
   `GHIDRA_MCP_EXTENSION_ZIP`, and restart Ghidra.
3. Enable `GhidraMCPPlugin` under `File` → `Configure` → `Developer`.
4. Optional: set the HTTP port under `Edit` → `Tool Options` →
   `GhidraMCP HTTP Server`. The default is port 8080, which matches
   `GHIDRA_MCP_SERVER`.

Headless GhidraMCP, for a one-shot outside Cursor, uses the extra installed
in the virtualenv:

```bash
"$GHIDRA_MCP_BIN" --headless --binary /absolute/path/to/program \
  --ghidra-install-dir "$GHIDRA_INSTALL_DIR" --discard
```

That process is an MCP server on stdio. It is not the `ghidra` entry in
`.cursor/mcp.json`.

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

For the sample APK, using the pinned headless JADX jar:

```bash
node scripts/rea.mjs inspect-android-package "$HOME/.local/share/rea/android/ApiDemos-debug.apk" --format json
node scripts/rea.mjs inspect-android-method \
  "$HOME/.local/share/rea/android/ApiDemos-debug.apk" \
  io.appium.android.apis.ApiDemos onCreate --format json
```

The skylot/jadx CLI is a separate decompiler. One class from the same APK:

```bash
jadx --single-class io.appium.android.apis.ApiDemos \
  --single-class-output /tmp/ApiDemos.java \
  "$HOME/.local/share/rea/android/ApiDemos-debug.apk"
```

For a small native binary, compile a C program and decompile one function with
Ghidra. The first launch imports the program and waits for auto-analysis:

```bash
gcc -O0 -g -o /tmp/rea-add add.c
node scripts/rea.mjs decompile /tmp/rea-add add_numbers --provider ghidra --format json
```

Rizin and GNU objdump are one-shot inspections. `REA_RIZIN_COMMAND` and
`REA_OBJDUMP_COMMAND` must be absolute paths, not shell lines:

```bash
node scripts/rea.mjs execute-rizin-command /tmp/rea-add iI --format json
node scripts/rea.mjs inspect-with-objdump /tmp/rea-add disassemble --format json
```

REA's one-shot GDB command needs a durable inferior TTY. A `gdb -batch`
session shows the binary itself. The REA command is:

```bash
node scripts/rea.mjs debug-with-gdb 'show version' --inferior-tty /dev/pts/N --format json
```

Frida's CLI and REA's one-shot command both use the local Frida runtime. REA
does not install `frida-server` on another device:

```bash
node scripts/rea.mjs instrument-with-frida spawn /bin/true \
  --script 'send("ok")' --duration-ms 1000 --format json
```

Check readiness after the variables are loaded:

```bash
node scripts/rea.mjs doctor --json
```

`healthy: true` means Node, the host, the installed skill, the Cursor
registration, and at least one configured provider are ready. Hopper and IDA
remain `missing_analysis_engine` until you configure them. That does not by
itself make the report unhealthy when Ghidra or JADX is available.

## JADX-AI-MCP stays on the GUI

[zinja-coder/jadx-ai-mcp](https://github.com/zinja-coder/jadx-ai-mcp) is a
JADX GUI plugin plus a Python MCP server. It is not a headless engine for
REA, and the helper does not install it. With skylot/jadx 1.5.1 or newer on
`PATH`:

```bash
jadx plugins --install "github:zinja-coder:jadx-ai-mcp"
```

You can also install the release JAR from the JADX GUI plugin manager. Then
open JADX GUI, load an APK, and confirm the plugin is listening. Upstream's
default plugin port is 8650. The companion server lives in that repository's
`jadx-mcp-server` directory. Stdio mode, which desktop MCP clients use:

```bash
uv run jadx_mcp_server.py
```

HTTP mode defaults to MCP port 8651 and reaches the plugin on 8650. Prefer
stdio, or keep HTTP on loopback. REA's Android tools keep using
`REA_JADX_MCP_JAR`.

## Hopper and IDA

Hopper and IDA are proprietary. This helper does not download or install them.
The generated env file leaves their lines commented.

Hopper has a Linux demo that does not need a paid license, and a paid macOS
application. Setup can install the Linux demo only after you approve that
separate step:

```bash
node scripts/rea.mjs setup --client cursor --install-hopper --dry-run
node scripts/rea.mjs setup --client cursor --install-hopper --yes
```

macOS still needs Hopper's first-run choice in the same user session. An
existing installation can be selected with `HOPPER_LAUNCHER_PATH`. See
[Hopper](installation.md#hopper).

IDA needs your own IDA installation and
[mrexodia/ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp). Copy
[ida-mcp.stub.json](examples/ida-mcp.stub.json), replace the `server.py` path
with your attached-mode registration, and point `REA_IDA_MCP_CONFIG` at that
copy. Do not set `REA_ANALYSIS_PROVIDER=ida` until that file is real. The
attached example expects the legacy GUI tools and
`--ida-rpc http://127.0.0.1:13337`. Headless mode is a different registration
that serves `idb_open`, `idb_list`, and `idb_close`. See
[IDA](ida-provider.md).

JEB is also a separate commercial product. Doctor mentions it only after you
set `REA_JEB_MCP_URL`. See [JEB](jeb-analysis.md).
