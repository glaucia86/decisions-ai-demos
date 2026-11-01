# Roteiros de demonstração — originais e adaptação

Abra o [índice HTML](index.html) localmente após baixar este repositório. No GitHub, links HTML mostram o código-fonte; não há deployment destes guias. As falas permanecem em português.

| Experiência | Versão adaptada | Original de 24/10/2026 |
| --- | --- | --- |
| Alô, TI — 7 minutos | [Roteiro](roteiro-demo-alo-ti.html) | [Original](originals/roteiro-demo-alo-ti.html) |
| Triagem — 9 minutos | [Roteiro](roteiro-demo-triagem.html) | [Original](originals/roteiro-demo-triagem.html) |

Os originais foram materializados oficialmente da Library da autora em Linux e publicados no commit `6004896cec19052c649d4ed1077343a1b4dd5896`. São documentos históricos, não instruções atualizadas. Nenhuma fala original foi reconstruída a partir de memória. `.gitattributes` impede conversão de finais de linha nos originais HTML.

| Original | Bytes | SHA-256 |
| --- | ---: | --- |
| roteiro-demo-alo-ti.html | 36981 | `65caed81e981100aea2f548678372cb9abf9de8313fcb6e04b2f7551fe19220a` |
| roteiro-demo-triagem.html | 37032 | `2aa8a8ef13773b3a4de92d474d167cc4ab8207060835472c4210dcf4b7e9fa23` |

## Diferenças das versões adaptadas

- Clone e diretório de trabalho apontam para `decisions-ai-demos`, com a aplicação na raiz.
- Links atuais levam ao README e guia local deste projeto; referências históricas específicas permanecem no commit de origem do evento.
- Aviso visível distingue adaptação e original, explica limites da validação e mantém `MESA_LIVE_ENABLED=false` nos exemplos. Ativação real exige decisão explícita posterior sobre acesso, custo e consentimento.
- Notas distinguem delegação custom/client da Triagem, delegação Responses da Alô, TI e integração nativa Decisions, que não foi implementada aqui.
- Índices novos resolvem o antigo link `index.html` e permitem navegar entre ambos os roteiros. O índice dentro de `originals/` é novo, não um original recuperado.
- Layout, falas, controles de copiar, modo palco e checklist foram preservados. Nenhuma mudança na UI/backend da aplicação.

## Validação

`node --test tests/demo-scripts.mjs` verifica hashes, caminhos, links locais/âncoras e os controles em Chromium headless: copiar texto, fallback de clipboard, modo palco e persistência, checklist, impressão e navegação recíproca. Também verifica layout em 390 px. Requer dependências e Chromium do Playwright, sem servidor Next, API, microfone ou segredos. A suíte inicia e encerra seu próprio servidor HTTP loopback em porta livre. Capturas ficam em `test-results/demo-scripts/`.

Os roteiros descrevem sessões reais para uma eventual apresentação; validar os HTMLs não comprova acesso, reconhecimento de fala, classificação do modelo, áudio ou encerramento remoto. [Validação da aplicação](../validacao.md) · [Configuração segura](../integracao-live.md).
