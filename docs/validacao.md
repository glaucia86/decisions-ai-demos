# Validação da extração — 1 de novembro de 2026

Ambiente local isolado: Windows, Node.js 24.19.0, npm 12.0.2, Chromium do Playwright 1.63.0. Código de origem e histórico: [proveniência](proveniencia.md).

| Verificação | Resultado local |
| --- | --- |
| Instalação pelo lockfile (`npm ci --ignore-scripts`) | Aprovada |
| Domínio, contratos e segurança (`node --test tests/*.test.mts`) | 105 passaram, 0 falhas |
| Typecheck (`npm run typecheck`) | Aprovado |
| Build (`npm run build`) | Aprovado; `/`, `/triagem` e `/api/live` presentes |
| Origem local em `next start` | 1 teste passou |
| Replay de comandos de voz | Aprovado; eventos sintéticos, sem áudio/API |
| Browser Alô, TI e live fixtures | Aprovados: BROWSER_CHECKS_PASS e LIVE_BROWSER_FIXTURE_PASS |
| Browser Triagem | 10 passaram, 0 falhas |

O sandbox inicialmente bloqueou a rede e o handshake WebSocket de loopback. Os testes foram repetidos com a permissão de execução local necessária, sem alterar as proteções do aplicativo. A instalação exige rede para baixar dependências; os testes e a build não exigem chave, microfone ou inferência paga.

## Evidências e reprodução

As capturas e o vídeo em `docs/media/` mostram exclusivamente dados fictícios. O vídeo da Alô, TI contém o rótulo **SIMULADO** e bloqueia solicitações a origens externas e à rota live. A captura da Triagem vem de **fixture de teste do navegador**, não de uma sessão GPT-Live real.

`node scripts/verify-browser.mjs` inicia um servidor próprio em porta livre, desativa live no processo, executa as duas suítes e grava a demonstração. Encerra apenas o servidor que iniciou. Para Chromium instalado em pasta isolada, configure `PLAYWRIGHT_BROWSERS_PATH` para essa pasta. Os comandos individuais estão no [README](../README.md).

O [workflow CI](https://github.com/glaucia86/decisions-ai-demos/actions/workflows/ci.yml) usa Ubuntu 24.04 e Node 24.21.0. Consulte a execução do commit desejado; uma badge não comprova todos os ambientes.

## Limites

Não foram testados reconhecimento de fala, áudio audível, acesso de conta, consumo, latência ou decisões reais do modelo. Não houve deployment. Os limiares e tickets são didáticos; a fila local não é backup e os limites em memória não são um teto financeiro. Não houve mudança no código de produção durante a extração.

Os guias oficiais GPT-Live, Decisions e delegação foram consultados em 1 de novembro de 2026. A documentação atual diferencia integração nativa Decisions de delegação custom/client usada pela Triagem; disponibilidade documental não valida acesso de uma conta. Fontes: [GPT-Live](https://developers.openai.com/api/docs/guides/live), [Decisions](https://developers.openai.com/api/docs/guides/decisions), [voz com Decisions](https://developers.openai.com/api/docs/guides/decisions-voice).

Revisão independente por GPT-6 Astra (medium): nenhum bloqueador material; corrigidos caminho residual da pasta e link de proveniência. A origem da gravação é normalizada para aceitar uma barra final na URL.

## Recuperação dos roteiros HTML

Os dois originais de 24/10 foram recuperados oficialmente da Library em Linux e integrados via Git. Seus hashes SHA-256 e tamanhos foram conferidos contra os bytes originais; `.gitattributes` preserva finais de linha. [Originais, adaptações e hashes](demo-scripts/README.md).

A suíte `node --test tests/demo-scripts.mjs` passou localmente nos dois originais e nas duas adaptações: links/âncoras locais, copiar todos os blocos, fallback de clipboard, modo palco e restauração, checklist, impressão, links recíprocos e ausência de overflow horizontal em 390 px. Renders desktop/mobile foram inspecionados. O teste normaliza CRLF do clipboard Windows e verifica seu conteúdo, evitando falso positivo de um botão anteriormente marcado como copiado.

Revisão independente adicional pelo agente `/root/review_extraction`, GPT-6 Astra medium: nenhum bloqueador material, hashes confirmados; sugestão de robustez dos testes de clipboard incorporada. JavaScript dos controles permanece igual ao original. Nenhuma alteração no código de produção da aplicação, API paga ou microfone. Esta suíte também integra a CI.
