# Deploy the admin page

This page can run behind a reverse proxy. It does not publish ports 80 or 443.
There is no billing, plan, Stripe, or checkout.

## Run

```bash
cp deploy/.env.example deploy/.env
# Edit the password. Keep the real file out of git.
docker compose -f deploy/docker-compose.yml up --build
```

The container listens on `0.0.0.0:4174`. Compose publishes that as
`127.0.0.1:4174` on the host. Point Traefik, Caddy, or nginx at port 4174.
Leave the Traefik labels in the Compose file commented until you fill in a
real host. Set `REA_TRUST_PROXY=1` only when that proxy overwrites
`X-Forwarded-For`. Set `REA_COOKIE_SECURE=1` when the browser uses HTTPS.
Set `REA_CORS_ORIGIN` to one exact origin when a browser on another origin
must call the API.

Health: `GET /api/health`. API notes: `GET /api/docs` and `GET /api/openapi.json`.

## Sandbox

`REA_SANDBOX=1` or the admin setting runs each analysis with
`docker run --network none --memory --cpus`. RAM and CPU limits are the
container cgroup. If `docker` is missing, the analysis does not fall back to
the host. The default is off, so a normal run stays on the host and the RAM
number is only displayed. Build the helper image yourself when you want it:

```bash
docker build -f deploy/Dockerfile.sandbox -t rea-sandbox:local .
```

The admin image in this repository was not executed as part of the unit tests.
Frida is presence only and is not started. Apktool is not a pipeline step.

## Companion tools

Bring these yourself. They are not copied into this repository:

- Ghidra and GhidraMCP
- JADX and jadx-headless-mcp
- Rizin
- Frida (presence only)
- objdump and gdb
- Apktool (caller-supplied, not invoked here)
- ida-pro-mcp is a public MIT project; IDA itself is proprietary and is not bundled

## License

This is not legal advice. REA's own code is MIT. Hosting this page does not
grant IDA, Hopper, or JEB rights. GPL and LGPL pieces, including GDB, Frida,
and Ghidra's GPL modules, stay under their own terms. Rizin and GhidraMCP are
not in this repository's license table (`NOT_ENOUGH_INFO`).

# Publicar o painel

Esta página pode ficar atrás de um proxy reverso. Ela não publica as portas
80 nem 443. Não há cobrança, plano, Stripe nem checkout.

## Rodar

```bash
cp deploy/.env.example deploy/.env
# Troque a senha. Não grave o arquivo real no git.
docker compose -f deploy/docker-compose.yml up --build
```

O contêiner escuta em `0.0.0.0:4174`. O Compose publica isso só em
`127.0.0.1:4174` no host. Aponte o Traefik, o Caddy ou o nginx para a porta 4174. Deixe os labels do Traefik comentados até preencher um host de verdade.
Use `REA_TRUST_PROXY=1` só quando o proxy preenche `X-Forwarded-For`.
Use `REA_COOKIE_SECURE=1` quando o navegador usa HTTPS.
Use `REA_CORS_ORIGIN` com uma origem exata quando outro site precisa chamar a API.

Saúde: `GET /api/health`. Notas: `GET /api/docs` e `GET /api/openapi.json`.

## Sandbox

`REA_SANDBOX=1`, ou o ajuste do administrador, roda cada análise com
`docker run --network none --memory --cpus`. Os limites de RAM e CPU são o
cgroup do contêiner. Se o `docker` não existir, a análise não cai no host.
O padrão é desligado: a análise fica no host e o número de RAM só aparece.
Monte a imagem auxiliar quando quiser:

```bash
docker build -f deploy/Dockerfile.sandbox -t rea-sandbox:local .
```

A imagem do painel deste repositório não foi executada nos testes unitários.
Frida só é detectada e não é iniciada. Apktool não é uma etapa do pipeline.

## Complementos

Instale você mesmo. Eles não são copiados para este repositório:

- Ghidra e GhidraMCP
- JADX e jadx-headless-mcp
- Rizin
- Frida (só presença)
- objdump e gdb
- Apktool (quem chama instala; esta página não invoca)
- ida-pro-mcp é um projeto público MIT; o IDA é proprietário e não vem junto

## Licença

Isto não é parecer jurídico. O código do REA é MIT. Hospedar esta página não
dá direito de IDA, Hopper ou JEB. Peças GPL e LGPL, inclusive GDB, Frida e os
módulos GPL do Ghidra, continuam nas licenças delas. Rizin e GhidraMCP não
estão na tabela de licenças deste repositório (`NOT_ENOUGH_INFO`).
