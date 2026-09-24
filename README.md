# Painel de Gestão Apollo

Página estática publicada pelo GitHub Pages. A interface e a lógica do painel estão em `index.html`.

## Pacotes de mensalidade

Administradores podem criar pacotes com frequência semanal, valor mensal e taxa de matrícula. O rótulo é gerado no formato `2x por semana - R$ 159,90 - sem taxa de matrícula` ou `2x por semana - R$ 176,90 - com taxa de matrícula de R$ 70,00`. Pacotes são organizados por núcleo e vinculados a uma ou mais equipes do mesmo núcleo.

O reajuste mostra a diferença por atleta e o impacto mensal estimado sobre os atletas ativos do pacote nas equipes afetadas. Para salvar, o administrador precisa conferir a simulação e confirmar novamente. O painel relê os dados antes de gravar; se houve mudança desde a simulação, exige nova conferência. O ajuste atualiza `teams.available_payment_plans` e `athletes.payment_plan` dos atletas ativos correspondentes. Não modifica atletas inativos, cobranças já emitidas ou outros núcleos.

O impacto é uma estimativa baseada no valor de tabela e na quantidade de atletas ativos. Não considera descontos, inadimplência, impostos ou pró-rata. As gravações usam a API REST do Supabase e tentam reverter alterações parciais em caso de falha; **não são uma transação única**. Para garantia de atomicidade, o banco precisará de uma função SQL/RPC transacional com política de acesso para administradores.

## Testes

```sh
npm install
npm test
npm run test:browser
```

O teste de navegador usa Microsoft Edge no Windows, quando disponível, ou o Chromium do Playwright (`npx playwright install chromium`). As chamadas ao Supabase são simuladas; os testes não alteram dados reais.
