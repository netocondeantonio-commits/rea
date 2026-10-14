# Complementary reverse-engineering tools

The public list
[zhuyansen/awesome-ai-reverse-engineering](https://github.com/zhuyansen/awesome-ai-reverse-engineering)
is a reference for AI-assisted reverse engineering. This page does not copy
that list. It records the projects mapped for a Cursor checkout of this
repository, and whether the operator helper installs them.

[Cursor local setup](cursor-local-setup.md) has the commands. The helper is
`scripts/install-free-analysis-engines.mjs`. `rea setup` does not run it and
does not install Java, Ghidra, Hopper, or IDA.

| Project                                                                                                 | In this checkout                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [NationalSecurityAgency/ghidra](https://github.com/NationalSecurityAgency/ghidra)                       | Installed by the helper as Ghidra 12.1.4. `GHIDRA_INSTALL_DIR` points at the extracted release. You supply a full JDK 21 or newer through `JAVA_HOME`.                                                                                                                              |
| [LaurieWired/GhidraMCP](https://github.com/LaurieWired/GhidraMCP)                                       | Installed as tag 2.0: the `ghidra-mcp` command, the `[headless]` extra, and the extension zip in `GHIDRA_MCP_EXTENSION_ZIP`. `.cursor/mcp.json` registers the GUI bridge as the `ghidra` server at `http://127.0.0.1:8080/`. The Ghidra GUI plugin still has to be enabled by hand. |
| [skylot/jadx](https://github.com/skylot/jadx)                                                           | Installed by the helper as the 1.5.6 CLI and linked on `PATH`. This is separate from REA's headless JADX jar.                                                                                                                                                                       |
| [1013503897/jadx-headless-mcp](https://github.com/1013503897/jadx-headless-mcp)                         | Installed by the helper as the pinned 0.7.1 JAR. `REA_JADX_MCP_JAR` points at it.                                                                                                                                                                                                   |
| [zinja-coder/jadx-ai-mcp](https://github.com/zinja-coder/jadx-ai-mcp)                                   | Documented only. It is a JADX GUI plugin and a Python MCP server. The helper does not install it and REA does not treat it as a headless engine.                                                                                                                                    |
| [mrexodia/ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp)                                         | Stub only. IDA is licensed separately. [ida-mcp.stub.json](examples/ida-mcp.stub.json) is an attached-mode registration. Set `REA_IDA_MCP_CONFIG` after you fill in the real `server.py` path.                                                                                      |
| [rizinorg/rizin](https://github.com/rizinorg/rizin)                                                     | Installed by the helper on Linux x64 as the 0.9.1 static build and linked on `PATH`. `REA_RIZIN_COMMAND` is that absolute path.                                                                                                                                                     |
| [frida/frida](https://github.com/frida/frida)                                                           | The helper installs `frida==17.23.2` and `frida-tools==14.11.0` in its virtualenv and links `frida` on `PATH`. REA does not install `frida-server` on a target.                                                                                                                     |
| GNU objdump and GDB                                                                                     | Installed with `apt` on Linux when the commands are missing. `REA_OBJDUMP_COMMAND` and `REA_GDB_COMMAND` are absolute paths. REA itself still does not install either tool.                                                                                                         |
| [zhuyansen/awesome-ai-reverse-engineering](https://github.com/zhuyansen/awesome-ai-reverse-engineering) | This page. The list stays upstream.                                                                                                                                                                                                                                                 |
| REA Cursor registration                                                                                 | `rea setup --client cursor` writes `~/.cursor/mcp.json` and the skill at `~/.agents/skills/reverse-engineer-anything`. The project `.cursor/mcp.json` launches REA and the GhidraMCP GUI bridge through `scripts/cursor-mcp-launch.mjs`.                                            |

Hopper is proprietary. The helper does not install the Linux demo. Setup can
install that demo only after a separate `--install-hopper` approval, or you
can set `HOPPER_LAUNCHER_PATH` to an existing launcher.
