# Production admin image. Open-source engines only. No IDA, Hopper, or JEB.
FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    GHIDRA_SHA256=ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db \
    JADX_SHA256=6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75 \
    APKTOOL_SHA256=dbf930b076c6b9be08d57c449cacefc3bdd6b71ebd59b3066fc0e1f5b14f9423 \
    RIZIN_SHA256=9102249a9f0b6319c5334a2e5cf8d9cc3f2035e1d3def027c41f6a90f647e8cf \
    FRIDA_TOOLS_VERSION=14.11.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    xz-utils \
    binutils \
    util-linux \
    python3 \
    python3-venv \
    openjdk-21-jre-headless \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sfn "$(dirname "$(dirname "$(readlink -f /usr/bin/java)")")" /opt/java

RUN curl -fsSL -o /tmp/ghidra.zip \
    https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip \
  && echo "${GHIDRA_SHA256}  /tmp/ghidra.zip" | sha256sum -c - \
  && unzip -q /tmp/ghidra.zip -d /opt \
  && ln -sfn /opt/ghidra_12.1.4_PUBLIC /opt/ghidra \
  && rm /tmp/ghidra.zip \
  && test -x /opt/ghidra/support/analyzeHeadless

RUN mkdir -p /opt/jadx /opt/apktool /opt/rizin \
  && curl -fsSL -o /opt/jadx/jadx-headless-mcp-0.7.1-all.jar \
    https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar \
  && echo "${JADX_SHA256}  /opt/jadx/jadx-headless-mcp-0.7.1-all.jar" | sha256sum -c - \
  && curl -fsSL -o /opt/apktool/apktool.jar \
    https://github.com/iBotPeaches/Apktool/releases/download/v3.0.3/apktool_3.0.3.jar \
  && echo "${APKTOOL_SHA256}  /opt/apktool/apktool.jar" | sha256sum -c - \
  && printf '%s\n' '#!/bin/sh' 'exec java -jar /opt/apktool/apktool.jar "$@"' > /usr/local/bin/apktool \
  && chmod 755 /usr/local/bin/apktool \
  && curl -fsSL -o /tmp/rizin.tar.xz \
    https://github.com/rizinorg/rizin/releases/download/v0.9.1/rizin-v0.9.1-static-x86_64.tar.xz \
  && echo "${RIZIN_SHA256}  /tmp/rizin.tar.xz" | sha256sum -c - \
  && tar -xJf /tmp/rizin.tar.xz -C /opt/rizin \
  && rm /tmp/rizin.tar.xz \
  && test -x /opt/rizin/bin/rizin \
  && python3 -m venv /opt/frida-tools \
  && /opt/frida-tools/bin/pip install --disable-pip-version-check "frida-tools==${FRIDA_TOOLS_VERSION}" \
  && ln -sfn /opt/frida-tools/bin/frida /usr/local/bin/frida \
  && chmod -R a+rX /opt/ghidra /opt/ghidra_12.1.4_PUBLIC /opt/jadx /opt/apktool /opt/rizin /opt/java /opt/frida-tools

ENV JAVA_HOME=/opt/java \
    GHIDRA_INSTALL_DIR=/opt/ghidra \
    REA_JADX_MCP_JAR=/opt/jadx/jadx-headless-mcp-0.7.1-all.jar \
    REA_RIZIN_COMMAND=/opt/rizin/bin/rizin \
    REA_OBJDUMP_COMMAND=/usr/bin/objdump \
    REA_APKTOOL_COMMAND=/usr/local/bin/apktool \
    REA_BIND=0.0.0.0 \
    REA_ANALYZE_PORT=4174 \
    REA_SANDBOX=1 \
    REA_SANDBOX_MODE=isolate \
    REA_SANDBOX_MEMORY_MB=2048 \
    PATH="/opt/rizin/bin:/opt/frida-tools/bin:/usr/local/bin:${PATH}"

WORKDIR /opt/rea
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
  && chmod 755 /opt/rea/deploy/entrypoint.sh \
  && chown -R node:node /opt/rea
EXPOSE 4174
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.REA_ANALYZE_PORT || 4174) + '/api/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/opt/rea/deploy/entrypoint.sh"]
