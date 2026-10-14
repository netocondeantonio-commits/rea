# Análise local sem agente

Este caminho roda o REA na sua máquina, sem Cursor, sem Claude e sem outro modelo. O painel escuta só em `127.0.0.1`. Ele não é um serviço hospedado, não tem conta, cobrança nem vários clientes. A CLI e o MCP do REA continuam iguais: o script apenas chama a CLI que já existe.

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
- Arquivo `.apk`, `.xapk` ou `.aab`: pacote Android, se `REA_JADX_MCP_JAR` apontar para o JAR `jadx-headless-mcp` 0.7.1.
- Binário ELF, Mach-O ou PE nativo: `objdump` e Rizin, quando estiverem no `PATH`, e o Ghidra quando `GHIDRA_INSTALL_DIR` estiver definido.
- Assembly .NET (PE com metadados CLI): inspeção gerenciada, sem motor nativo.
- Diretório só com `index.html`: o relatório diz que a observação no navegador precisa de um Chrome com porta de depuração. Este comando não abre navegador.
- `https://github.com/org/repo`: clone raso (`git clone --depth 1`) para a pasta da execução e, em seguida, a mesma detecção acima.

Outras URLs são recusadas. O script não baixa um site arbitrário e não executa o texto colado num shell.

## Variáveis

Nenhuma chave de API é necessária.

| Variável              | Quando importa                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `GHIDRA_INSTALL_DIR`  | Visão nativa com Ghidra. Sem ela, o relatório ainda pode trazer `objdump` e Rizin.                        |
| `JAVA_HOME`           | JDK completo usado pelo Ghidra e pelo JADX. O script não instala Java.                                    |
| `REA_JADX_MCP_JAR`    | Caminho absoluto do JAR `jadx-headless-mcp` 0.7.1. Sem ele, um APK gera um relatório que explica a falta. |
| `REA_OBJDUMP_COMMAND` | Caminho absoluto do `objdump`, se não for o do `PATH`.                                                    |
| `REA_RIZIN_COMMAND`   | Caminho absoluto do `rizin`, se não for o do `PATH`.                                                      |
| `REA_ANALYZE_OUTPUT`  | Pasta dos relatórios.                                                                                     |
| `REA_ANALYZE_PORT`    | Porta do painel. Padrão: `4174`.                                                                          |

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

## O que não muda

`npm start` continua sendo o servidor MCP por stdio. `rea setup` não chama este painel. Um produto separado, se existir, fica em outro repositório e não faz parte daqui.
