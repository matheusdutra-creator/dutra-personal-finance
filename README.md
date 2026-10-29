# Minhas Finanças

App pessoal de controle financeiro: lançamentos de receitas e despesas, várias contas (Flash, cartão, conta corrente…), orçamento mensal por conta e análise de gastos por categoria.

É um *web app instalável* (PWA): abre no navegador do celular e pode ser adicionado à tela inicial como um app comum. Funciona sem internet.

## Onde ficam os dados

Os dados ficam **somente no aparelho** onde o app é usado (armazenamento do navegador). Nada é enviado para servidores, e o código público no GitHub não contém nenhum dado pessoal.

Use **Ajustes → Fazer backup** de vez em quando e guarde o arquivo `.json` (Drive, e-mail etc.). Para trocar de celular, use **Ajustes → Restaurar backup** no aparelho novo.

## Instalar no celular

- **iPhone:** abra o link no Safari → Compartilhar → “Adicionar à Tela de Início”.
- **Android:** abra o link no Chrome → menu ⋮ → “Instalar app”.

## Rodar no computador (para desenvolver)

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000.
