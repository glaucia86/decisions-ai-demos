# Prática guiada sem API

Adaptado do [LAB original](https://github.com/glaucia86/devday-exchange-community-rio-2026/blob/ab074cc44ec36cd20ce4d6b593a4cd152e41b5f7/labs/02-decisions-typescript/README.md). Execute os comandos na raiz deste repositório.

1. Instale as dependências e gere a build seguindo o [README](../README.md).
2. Abra a rota principal, confirme **Modo simulado: respostas preparadas** e escolha **Explorar cenário**.
3. Analise o relato, confira contexto, equipe e impacto. A revisão humana precede a criação de ticket fictício.
4. Use **Corrigir o relato** para editar o texto; a análise anterior é invalidada. **Simular uma correção** insere o exemplo preparado.
5. Marque a revisão e confirme o ticket simulado. Recomece para limpar o fluxo.
6. Abra `/triagem`: sem configuração, o live permanece desativado. A automação de navegador testa o quadro com transporte simulado.

Para estudar o contrato sem servidor, execute `npm test` e `node scripts/replay-voice-commands.mts`. Leia [live-contract.ts](../src/domain/live-contract.ts), [triage.ts](../src/domain/triage.ts) e seus testes. Contexto insuficiente ou baixa confiança encaminham para revisão humana; uma resposta inválida não vira decisão.

## Live opcional

Siga o [guia local](integracao-live.md) somente após conferir documentação atual, acesso da conta e orçamento. A chave fica em `.env.local`, nunca em chat ou commit, sem prefixo NEXT_PUBLIC. Use código de acesso local diferente da chave; mantenha `MESA_LIVE_ENABLED=false` até decidir autorizar custo. Microfone, inferência e áudio reais não são comprovados pelos testes mock.

O quadro pode persistir relatos fictícios, fila e contador no localStorage. Pausar pede encerramento; retomar cria outra sessão. A fila comporta 20 relatos e não é backup. **Nova triagem** apaga o quadro após confirmação; nesta versão, só aparece quando existem cartões ou fila. Mutar áudio não encerra sessão.
