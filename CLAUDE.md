# Notas do projeto

- Usuário iniciante em programação (sabe um pouco de Python e R); prefere não ver código. Explicar mudanças em português, em termos de comportamento do app.
- App PWA em HTML/CSS/JS puros, sem build e sem dependências externas: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`.
- Publicado via GitHub Pages (branch `main`, pasta raiz). Toda mudança enviada ao GitHub chega no celular sozinha (o service worker busca a versão da rede primeiro).
- Dados ficam só no aparelho, em `localStorage` (chave `financas-v1`). Qualquer mudança no formato dos dados precisa continuar lendo backups e dados antigos (ver `normalizar()` em `app.js`).
- Modelo de dados: contas têm `tipo` (corrente, cartao, beneficio, outro) e `saldoInicial`; lançamentos são despesa, receita ou transferencia (`contaDestinoId`, ex.: pagar fatura — não conta como gasto); `recorrencias` são lançadas sozinhas até hoje (`geradoAte`) e projetadas no futuro.
- Rotina do usuário: salário cai no último dia do mês na conta corrente, paga o cartão logo depois e passa o mês comprando no crédito. A tela inicial mostra o "livre até o próximo salário" (conta corrente − fatura − recorrentes previstos); o salário é a maior receita recorrente na conta corrente.
- Dados pessoais (planilhas, backups `.json`, `.csv`) nunca entram no git — ver `.gitignore`.
- Testar localmente: configuração `app` em `.claude/launch.json` (servidor Python na porta 8000), sempre em tamanho de celular.
- Ao adicionar arquivos novos que o app carrega, incluí-los também na lista `ARQUIVOS` de `sw.js`.
