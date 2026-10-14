# Deploy the admin page

This page can run behind an existing Traefik. Compose does not publish ports
80 or 443. There is no billing, plan, Stripe, or checkout. IDA, Hopper, and
JEB are not installed in the image.

## Run

```bash
cd deploy
cp .env.example .env
# Edit the password. Keep the real file out of git.
docker compose up -d --build
```

The service name is `rea-admin`. Inside the container the process listens on
`0.0.0.0:4174`. Compose only exposes that port on the container network.
Traefik, using the host network and `traefik.enable=true`, reaches the
container IP. The default host is `rea-187-77-225-72.sslip.io`, the entrypoint
is `websecure`, and the cert resolver is `letsencrypt`. Override them with
`REA_TRAEFIK_HOST`, `REA_TRAEFIK_ENTRYPOINT`, `REA_TRAEFIK_CERTRESOLVER`, and
`REA_TRAEFIK_ENABLE` in `deploy/.env` before `docker compose up`.

Set `REA_TRUST_PROXY=1` only when that proxy overwrites `X-Forwarded-For`.
Set `REA_COOKIE_SECURE=1` when the browser uses HTTPS.
Set `REA_CORS_ORIGIN` to one exact origin when a browser on another origin
must call the API.

Health: `GET /api/health`. API notes: `GET /api/docs` and `GET /api/openapi.json`.

The image installs Ghidra 12.1.4 headless, Eclipse Temurin JDK 21, jadx-headless-mcp 0.7.1,
Rizin 0.9.1, Apktool 3.0.3, objdump, and Frida tools 14.11.0. The service
limit in Compose is 6g of RAM and 2 CPUs. A job isolate defaults to 2048 MB.

## Sandbox

`REA_SANDBOX=1` is set in this Compose file. The default mode is `isolate`:
`unshare --user --map-root-user --net`, then `taskset`, then `prlimit`.
Docker's default seccomp blocks `unshare`, so Compose sets
`seccomp:unconfined` on this service.
The address-space cap is four times the requested RAM because a JVM reserves
more virtual memory than its heap. `JAVA_TOOL_OPTIONS` sets `-Xmx` to about
60% of that RAM. The container `mem_limit` is the host cgroup for the whole
service. If `unshare`, `prlimit`, or `taskset` is missing, the analysis does
not run on the host.

`REA_SANDBOX_MODE=docker` keeps the older `docker run --network none --memory
--cpus` path. Build the helper image yourself when you want that mode:

```bash
docker build -f deploy/Dockerfile.sandbox -t rea-sandbox:local .
```

Apktool decodes the manifest and strings and does not emit smali. Frida only
lists devices. It does not attach and does not inject.

## Companion tools in the image

- Ghidra 12.1.4 headless and a caller-supplied GhidraMCP path, if you set one
- JADX via jadx-headless-mcp 0.7.1
- Rizin 0.9.1
- Frida tools, for a device list only
- objdump
- Apktool 3.0.3
- ida-pro-mcp is not bundled; IDA itself is proprietary and is not bundled

## License

This is not legal advice. REA's own code is MIT. Hosting this page does not
grant IDA, Hopper, or JEB rights. The image redistributes Ghidra, JADX,
Apktool, Rizin, and Frida tools; their licenses stay with those files inside
the image. GPL and LGPL pieces, including GDB, Frida, and Ghidra's GPL
modules, stay under their own terms. Rizin and GhidraMCP are not in this
repository's license table (`NOT_ENOUGH_INFO`).

# Publicar o painel

Esta página pode ficar atrás de um Traefik que já existe. O Compose não
publica as portas 80 nem 443. Não há cobrança, plano, Stripe nem checkout.
IDA, Hopper e JEB não entram na imagem.

## Rodar

```bash
cd deploy
cp .env.example .env
# Troque a senha. Não grave o arquivo real no git.
docker compose up -d --build
```

O serviço se chama `rea-admin`. Dentro do contêiner o processo escuta em
`0.0.0.0:4174`. O Compose só expõe essa porta na rede do contêiner. O
Traefik, em rede do host e com `traefik.enable=true`, alcança o IP do
contêiner. O host padrão é `rea-187-77-225-72.sslip.io`, o entrypoint é
`websecure` e o certresolver é `letsencrypt`. Troque com `REA_TRAEFIK_HOST`,
`REA_TRAEFIK_ENTRYPOINT`, `REA_TRAEFIK_CERTRESOLVER` e `REA_TRAEFIK_ENABLE`
em `deploy/.env` antes do `docker compose up`.

Use `REA_TRUST_PROXY=1` só quando o proxy preenche `X-Forwarded-For`.
Use `REA_COOKIE_SECURE=1` quando o navegador usa HTTPS.
Use `REA_CORS_ORIGIN` com uma origem exata quando outro site precisa chamar a API.

Saúde: `GET /api/health`. Notas: `GET /api/docs` e `GET /api/openapi.json`.

A imagem instala o Ghidra 12.1.4 headless, Eclipse Temurin JDK 21, jadx-headless-mcp
0.7.1, Rizin 0.9.1, Apktool 3.0.3, objdump e Frida tools 14.11.0. O limite
do serviço no Compose é 6g de RAM e 2 CPUs. O isolate de cada análise usa
2048 MB por padrão.

## Sandbox

`REA_SANDBOX=1` está neste Compose. O modo padrão é `isolate`:
`unshare --user --map-root-user --net`, depois `taskset` e `prlimit`.
O seccomp padrão do Docker bloqueia `unshare`, então o Compose define
`seccomp:unconfined` neste serviço.
O teto de espaço de endereços é quatro vezes a RAM pedida, porque a JVM
reserva mais memória virtual do que o heap. `JAVA_TOOL_OPTIONS` define
`-Xmx` em cerca de 60% dessa RAM. O `mem_limit` do contêiner é o cgroup do
host para o serviço inteiro. Se faltarem `unshare`, `prlimit` ou `taskset`,
a análise não roda no host.

`REA_SANDBOX_MODE=docker` mantém o caminho antigo
`docker run --network none --memory --cpus`. Monte a imagem auxiliar quando
quiser esse modo:

```bash
docker build -f deploy/Dockerfile.sandbox -t rea-sandbox:local .
```

O Apktool decodifica o manifesto e as strings e não gera smali. O Frida só
lista dispositivos. Não anexa e não injeta.

## Complementos na imagem

- Ghidra 12.1.4 headless e, se você definir, um caminho de GhidraMCP
- JADX pelo jadx-headless-mcp 0.7.1
- Rizin 0.9.1
- Frida tools, só para listar dispositivos
- objdump
- Apktool 3.0.3
- ida-pro-mcp não vem na imagem; o IDA é proprietário e não vem junto

## Licença

Isto não é parecer jurídico. O código do REA é MIT. Hospedar esta página não
dá direito de IDA, Hopper ou JEB. A imagem redistribui Ghidra, JADX, Apktool,
Rizin e Frida tools; as licenças deles continuam nos arquivos dentro da
imagem. Peças GPL e LGPL, inclusive GDB, Frida e os módulos GPL do Ghidra,
continuam nas licenças delas. Rizin e GhidraMCP não estão na tabela de
licenças deste repositório (`NOT_ENOUGH_INFO`).
