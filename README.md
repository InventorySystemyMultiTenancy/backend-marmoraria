# Marmoraria Pedras Pedroza — Backend

API REST em Node.js + Express + PostgreSQL (Prisma) para o sistema de gestão e e-commerce da Marmoraria Pedras Pedroza.

## Pré-requisitos

- Node.js 20+
- PostgreSQL (local, Render ou Supabase)
- Conta Cloudinary (opcional para upload de imagens dos mármores)

## Como rodar localmente

```bash
npm install
cp .env.example .env
# edite o .env com sua DATABASE_URL e demais variáveis

npx prisma migrate dev --name init
npm run seed

npm run dev
```

A API sobe em `http://localhost:3001`. Healthcheck em `GET /health`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `JWT_SECRET` | Chave secreta para assinatura dos tokens JWT |
| `JWT_EXPIRES_IN` | Validade do token (ex: `7d`) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Credenciais do Cloudinary para upload de imagens |
| `FRONTEND_URL` | URL do frontend, usada na configuração de CORS |
| `PORT` | Porta da API (padrão `3001`) |
| `NODE_ENV` | `development` ou `production` |
| `COMPANY_NAME` / `COMPANY_WHATSAPP` | Usados como fallback em textos e PDFs |

## Usuários de teste (após `npm run seed`)

| Papel | Email | Senha |
|---|---|---|
| MASTER | master@pedraspedroza.com.br | master123 |
| ADMIN | admin@pedraspedroza.com.br | admin123 |
| SALESPERSON | vendas@pedraspedroza.com.br | vendas123 |
| EMPLOYEE | funcionario@pedraspedroza.com.br | func123 |

## Scripts

- `npm run dev` — desenvolvimento com hot reload (tsx watch)
- `npm run build` — compila TypeScript para `dist/`
- `npm start` — roda a versão compilada (produção)
- `npm run prisma:migrate` — cria/aplica migrations em desenvolvimento
- `npm run prisma:deploy` — aplica migrations em produção
- `npm run seed` — popula o banco com dados de exemplo

## Deploy no Render

1. Crie um banco PostgreSQL no Render (ou use `render.yaml` com `render blueprint`).
2. Crie um Web Service apontando para este repositório.
3. Configure as variáveis de ambiente listadas acima (Render gera `JWT_SECRET` automaticamente via blueprint).
4. Build command: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
5. Start command: `npm start`

## Arquitetura

- **Prisma ORM** para acesso ao PostgreSQL com migrations versionadas.
- **JWT em cookie httpOnly** para autenticação stateless.
- **RBAC granular**: papéis (`MASTER`, `ADMIN`, `EMPLOYEE`, `SALESPERSON`) + permissões individuais armazenadas em JSON por usuário.
- **mathjs** para avaliação segura da fórmula de precificação configurável pelo MASTER.
- **Puppeteer** para geração de PDFs de orçamento no servidor.
- **Cloudinary** para upload e hospedagem das imagens do catálogo de mármores.
