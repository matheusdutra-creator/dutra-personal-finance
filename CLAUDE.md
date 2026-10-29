# Notas do projeto

- Usuário iniciante em programação (sabe um pouco de Python e R); prefere não ver código. Explicar mudanças em português, em termos de comportamento do app.
- App PWA em HTML/CSS/JS puros, sem build e sem dependências externas: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`.
- Publicado via GitHub Pages (branch `main`, pasta raiz). Toda mudança enviada ao GitHub chega no celular sozinha (o service worker busca a versão da rede primeiro).
- Dados ficam só no aparelho, em `localStorage` (chave `financas-v1`). Qualquer mudança no formato dos dados precisa continuar lendo backups e dados antigos (ver `normalizar()` em `app.js`).
- Dados pessoais (planilhas, backups `.json`, `.csv`) nunca entram no git — ver `.gitignore`.
- Testar localmente: configuração `app` em `.claude/launch.json` (servidor Python na porta 8000), sempre em tamanho de celular.
- Ao adicionar arquivos novos que o app carrega, incluí-los também na lista `ARQUIVOS` de `sw.js`.
