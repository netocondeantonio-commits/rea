# Análise local sem agente

Este caminho roda o REA na sua máquina, sem Cursor, sem Claude e sem outro modelo. Por padrão o painel escuta em `127.0.0.1`. Dá para publicá-lo atrás de um proxy, sem planos, cobrança ou checkout. Há usuários e papéis. A CLI e o MCP do REA continuam iguais: o script apenas chama a CLI que já existe.

O site público em `website/` não recebe esse painel. A página local fica em `scripts/local-analyze-dashboard.html` e só sobe quando você pede.

## Abrir o painel

Na raiz do repositório, com as dependências instaladas e o runtime compilado (`npm ci` e `npm run build:cached`):

```bash
npm run analyze -- --serve
```

Abra o endereço que o comando imprimir. A porta padrão é `4174`. Outra porta:

```bash
npm run analyze -- --serve --port 4180
```

Cole um caminho absoluto, ou uma URL `https://github.com/org/repo`, e use **Analisar**. O andamento aparece na mesma página. O relatório fica em HTML e Markdown.

## Analisar sem deixar o painel aberto

```bash
npm run analyze -- /caminho/absoluto/do/alvo --no-serve
```

O comando escreve o relatório e termina. Sem `--no-serve`, ele também deixa o painel aberto até você interromper o processo.

A pasta padrão é `$HOME/.local/share/rea/analyses/<id>/`. Cada execução guarda `report.md`, `report.html` e os JSON em `evidence/`. Para outra pasta:

```bash
npm run analyze -- /caminho/do/alvo --no-serve --output /caminho/dos/relatorios
```

`REA_ANALYZE_OUTPUT` e `REA_ANALYZE_PORT` fazem o mesmo papel dessas opções.

## O que colar

- Diretório com `package.json`: análise estática de JavaScript. Se o pacote declara Electron, o REA segue o fluxo de aplicativo JavaScript que já existe.
- Arquivo `.apk`, `.xapk` ou `.aab`: Apktool decodifica o manifesto e as strings, sem smali, quando `apktool` ou `REA_APKTOOL_COMMAND` existe. JADX roda se `REA_JADX_MCP_JAR` apontar para o JAR `jadx-headless-mcp` 0.7.1. O Frida, se estiver no PATH, só lista dispositivos: não anexa e não injeta.
- Binário ELF, Mach-O ou PE nativo: `objdump` e Rizin, quando estiverem no `PATH`, e o Ghidra quando `GHIDRA_INSTALL_DIR` estiver definido.
- Assembly .NET (PE com metadados CLI): inspeção gerenciada, sem motor nativo.
- Diretório só com `index.html`: o relatório diz que a observação no navegador precisa de um Chrome com porta de depuração. Este comando não abre navegador.
- `https://github.com/org/repo`: clone raso (`git clone --depth 1`) para a pasta da execução e, em seguida, a mesma detecção acima.
- O APK de prática ApiDemos 6.0.18, com o endereço e o SHA-256 gravados no repositório. Esse é o único arquivo remoto que o painel baixa. O hash é conferido antes de analisar.

Outras URLs são recusadas. O script não baixa um site arbitrário e não executa o texto colado num shell.

## Variáveis

Nenhuma chave de API é necessária.

| Variável              | Quando importa                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `GHIDRA_INSTALL_DIR`  | Visão nativa com Ghidra. Sem ela, o relatório ainda pode trazer `objdump` e Rizin.                        |
| `JAVA_HOME`           | JDK completo usado pelo Ghidra e pelo JADX. O script não instala Java.                                    |
| `REA_JADX_MCP_JAR`    | Caminho absoluto do JAR `jadx-headless-mcp` 0.7.1. Sem ele, o APK ainda pode passar pelo Apktool.         |
| `REA_APKTOOL_COMMAND` | Caminho absoluto do lançador do Apktool. Sem ele, o painel procura `apktool` no `PATH`.                   |
| `REA_OBJDUMP_COMMAND` | Caminho absoluto do `objdump`, se não for o do `PATH`.                                                    |
| `REA_RIZIN_COMMAND`   | Caminho absoluto do `rizin`, se não for o do `PATH`.                                                      |
| `REA_ANALYZE_OUTPUT`  | Pasta dos relatórios, se os ajustes do painel não escolherem outra.                                       |
| `REA_ANALYZE_PORT`    | Porta do painel. Padrão: `4174`.                                                                          |
| `REA_ADMIN_USER`      | Usuário do administrador local. Padrão: `admin`.                                                          |
| `REA_ADMIN_PASSWORD`  | Senha desse usuário. Se faltar na primeira abertura, o processo imprime uma senha uma única vez.          |
| `REA_ADMIN_TOKEN`     | Opcional. Com 16 caracteres ou mais, scripts enviam `Authorization: Bearer`. Não cria nem apaga usuários. |
| `REA_ADMIN_DIR`       | Pasta dos usuários, ajustes, alvos e da auditoria. Padrão: `~/.local/share/rea/admin`.                    |

Hopper e IDA não são instalados por este comando. Se quiser usá-los, configure-os à parte e chame a CLI diretamente.

## Pacote em português e inglês

No fim da análise, a pasta da execução ganha `output/<nome-do-alvo>/`. O nome é o do arquivo ou da pasta, com caracteres estranhos trocados por hífen. O painel lista esses arquivos com uma frase curta para cada um. Dá para alternar o idioma do painel entre português e inglês.

| Arquivo                                                     | O que é                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.pt-BR.md` e `README.en.md`                          | Por onde começar, o que foi lido e a ordem dos outros arquivos. Há um HTML com o mesmo texto.                                                        |
| `overview.*.md`                                             | Módulos, ponto de entrada, bibliotecas declaradas e os comandos que o próprio `package.json` escreveu.                                               |
| `architecture.*.md`, `architecture.svg`, `architecture.mmd` | Mapa das partes e ligações que os motores registraram. A imagem abre direto. O `.mmd` é o mesmo mapa em Mermaid.                                     |
| `openapi.json` e `openapi.*.md`                             | Contrato OpenAPI. Se nenhuma rota HTTP foi achada no texto nem no JSON, o contrato fica vazio e a página explica isso. Nenhuma requisição é enviada. |
| `findings.*.md`                                             | Contagens e avisos copiados do motor. Não é um certificado de segurança.                                                                             |
| `tools.*.md`                                                | O que REA, Ghidra, JADX, objdump, Rizin, Frida, GhidraMCP, GDB e o doctor fizeram. Frida e GDB não são executados neste caminho.                     |
| `glossary.*.md`                                             | Glossário curto.                                                                                                                                     |
| `doctor.json` e `doctor.*.md`                               | Prontidão das ferramentas nesta máquina, não uma análise do alvo.                                                                                    |
| `strings.txt` e `strings.*.md`                              | Trechos de texto encontrados. Não são classificados como segredo.                                                                                    |
| `evidence/`                                                 | Cópia do JSON original da CLI.                                                                                                                       |
| `index.html`                                                | As duas línguas lado a lado, com os mesmos links.                                                                                                    |

O texto é montado por regras a partir dos arquivos e do JSON. Nenhum modelo escreve esse pacote. Se um campo não veio no alvo, a página diz que ele não foi declarado.

## Painel administrador

`npm run analyze -- --serve` abre o mesmo endereço de antes, agora com login. A página HTML é pública; as rotas de análise, pacote e relatório pedem sessão ou o token. O cookie `rea_session` fica só neste navegador, por cerca de 12 horas.

As telas são: início (motores, fila e análises recentes), nova análise, histórico com andamento, cancelamento e nova execução, resultado (mapa, OpenAPI, visão do código, textos em português e inglês, evidência), biblioteca de alvos, ajustes, usuários e auditoria. Dá para alternar o tema claro/escuro e o idioma. A biblioteca já traz o repositório e o APK de prática do ApiDemos.

Um administrador cria operadores, muda senhas e desativa contas. O usuário `env-admin`, vindo do ambiente, não pode ser apagado nem desativado. Sempre fica pelo menos um administrador ativo. A auditoria guarda quem entrou, quem analisou, quem cancelou e quem mudou usuários ou ajustes. Senhas não entram nesse registro.

Ajustes de caminho (`GHIDRA_INSTALL_DIR`, `JAVA_HOME`, `REA_JADX_MCP_JAR`, `REA_RIZIN_COMMAND`, `REA_OBJDUMP_COMMAND`, `REA_GDB_COMMAND`, `GHIDRA_MCP_BIN`) valem só para o processo filho do REA. Eles não alteram o `PATH` do seu shell. A pasta de saída vazia volta ao padrão da linha de comando.

Para exportar, abra a análise e use o ZIP. Ele junta a pasta da execução, sem `node_modules` nem `.git`, com limite de tamanho. Os arquivos do pacote também abrem um a um.

Exemplo para um script, com o painel já aberto:

```bash
curl -sS -X POST http://127.0.0.1:4174/api/analyze \
  -H "Authorization: Bearer $REA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"target":"/caminho/do/app","kind":"auto"}'
```

Copie `docs/examples/rea-admin.env.example` para `.env` na raiz do repositório ou para `~/.local/share/rea/admin.env`. Não grave a senha real no git. A versão em inglês destes passos está em [Local admin](local-admin.md).

## Ferramentas a mais no painel

Estas funções rodam no mesmo processo local, sem modelo:

- Comparar duas análises já feitas: hashes, `strings.txt` e rotas do OpenAPI. A lista de diferenças é limitada.
- Repetir um alvo da biblioteca a cada N minutos (mínimo 15). O relógio existe só enquanto o painel está aberto. Se o SHA-256 do manifesto mudar, o painel grava a auditoria e, se houver webhook, avisa. A primeira execução só guarda o hash.
- Fila com prioridade baixa, normal ou alta. Uma análise em andamento não é interrompida. `nice` de 0 a 19, quando o comando `nice` existe e o sandbox está desligado, vale para o processo filho. Sem sandbox, o número de RAM é só mostrado. Com `REA_SANDBOX=1`, o padrão é isolate (`unshare`, `taskset`, `prlimit`). `REA_SANDBOX_MODE=docker` usa `--memory` e `--cpus`.
- Cada análise ganha `hashes.sha256`. Se o segredo local tiver pelo menos 16 caracteres, `signature.txt` traz um HMAC desse manifesto. É uma etiqueta de integridade deste computador, não um certificado público.
- Lista no estilo de um checklist, com verde, âmbar e vermelho. Vermelho é etapa do motor que falhou. O texto copia rotas, permissões Android e URLs `http://` que já estavam nos arquivos. Não é um certificado OWASP e não significa que o programa é seguro.
- Busca em textos `.txt`, `.json` e `.md` das análises: strings, rotas e nomes `android.permission`.
- Três PDFs: cliente, interno e CTF. O CTF não inventa flag nem solução. A fonte cobre letras comuns do português; o resto vira `?`.
- Webhook opcional ao terminar uma análise manual. Discord recebe `content`, Telegram recebe `text` e, se você preencher, `chat_id`. Qualquer outro `http` ou `https` recebe JSON `{event, job}`. A auditoria guarda o status HTTP, não o URL. O token de um bot do Telegram fica no caminho; não o copie para o git.
- Link de leitura com token, cerca de 7 dias, em `/r/<token>`. O token é a capacidade de leitura. No padrão a página só escuta em 127.0.0.1. Se você publicar o painel, quem tiver o token lê o relatório.
- Exportar e importar a configuração dos motores. Chaves fora da lista (`PATH`, `LD_PRELOAD` e qualquer outra) são descartadas.
- Modo rápido para JavaScript e site estático: não chama Ghidra nem JADX. Em APK, nativo ou .NET o modo recusa e não chama esses motores.

O sandbox começa desligado neste computador. Ligue com `REA_SANDBOX=1` ou no ajuste do administrador. O modo padrão, quando ligado, é isolate: sem rede, com `taskset` e `prlimit`. Se `unshare`, `prlimit` ou `taskset` faltarem, a análise não roda no host. `REA_SANDBOX_MODE=docker` usa a imagem descrita em `deploy/Dockerfile.sandbox`, com `--memory` e `--cpus`. A imagem de produção em `deploy/Dockerfile` liga o isolate e já traz Ghidra, JADX, Rizin, Apktool e as ferramentas do Frida. O passo do Frida só lista dispositivos.

Upload de APK e binário fica em `output/uploads/<usuário>/`, com teto de tamanho e conferência do tipo pelo conteúdo. O papel `user` na API é gravado como usuário (operador). Um administrador vê todas as análises. Outro usuário recebe 404 na análise de outra pessoa. `GET /api/health`, `GET /api/openapi.json` e `GET /api/docs` descrevem a API. O modo `REA_DEMO=1` só aceita upload, GitHub ou o APK fixado.

## Licença e hospedagem sem cobrança

Isto não é parecer jurídico. O texto abaixo só aponta o que os arquivos deste repositório dizem.

O código do REA em `LICENSE` é MIT, Copyright (c) 2026 morluto. A licença permite usar, copiar, modificar, mesclar, publicar, distribuir, sublicenciar e vender cópias, desde que o aviso de copyright e a permissão acompanhem o software. Não há garantia. O MIT, sozinho, não proíbe cobrar por um serviço feito com o código do REA. Também não licencia Ghidra, JADX, Frida, GDB, Rizin, IDA, Hopper ou JEB.

`THIRD_PARTY_NOTICES.md` pede para verificar permissões antes de publicar saída de análise, compartilhar acesso às ferramentas ou operar um serviço. Um resumo não interpreta um contrato. Uma API da IDA não concede direito de hospedagem nem de usuários extras. A EULA publicada do JEB restringe divulgar código descompilado, artefatos reconstruídos e relatórios de análise, salvo se a edição permitir.

Ghidra, JADX, jadx-headless-mcp e Apktool estão registrados como Apache-2.0. Redistribuir o binário exige manter LICENSE e NOTICE. Há módulos GPL dentro do Ghidra; a licença de topo não substitui os avisos da distribuição. GDB está como GPL-3.0-or-later: invocar um binário já instalado na máquina não é, por si, distribuí-lo; distribuir o binário ou ligá-lo ao produto aciona o copyleft. Frida está como LGPL-2.0 com a exceção WxWindows. A exceção cobre certos casos de código objeto sob termos próprios. Isso não decide um serviço com vários clientes. IDA, Hopper e JEB são ferramentas proprietárias; o REA não entrega licença delas.

Rizin e GhidraMCP não aparecem na tabela de licenças do repositório. A partir desse inventário, a resposta é `NOT_ENOUGH_INFO`. OpenJDK, quando o usuário o instala, é GPLv2 com exceção Classpath. Node.js é MIT.

Esta página pode ser publicada atrás de um proxy, sem planos, cobrança, Stripe ou checkout. Isso não libera IDA, Hopper ou JEB, nem troca a licença das peças GPL/LGPL. Rizin e GhidraMCP continuam fora da tabela (`NOT_ENOUGH_INFO`).

## O que não muda

`npm start` continua sendo o servidor MCP por stdio. `rea setup` não chama este painel. Não há checkout. O deploy opcional está em `deploy/README.md`.
