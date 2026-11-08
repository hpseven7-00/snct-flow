# SNCT Flow

O SNCT Flow apoia a gestão do fluxo de visitantes em eventos científicos, como a Semana Nacional de Ciência e Tecnologia. Monitores veem o mesmo mapa de salas e registram entradas, saídas e bloqueios.

## Arquitetura para vários monitores

- **Interface:** React, TypeScript, Vite e Tailwind CSS.
- **API:** servidor HTTP Node.js com rotas REST no mesmo domínio da interface.
- **Banco compartilhado:** PostgreSQL para salas, contas, tentativas de login e sessões.
- **Autenticação:** contas individuais, sessão opaca em cookie `HttpOnly`, `SameSite=Strict`, senha derivada com `scrypt`; o coordenador cadastra contas de monitores.
- **Sincronização:** a interface consulta as salas a cada 5 segundos e após cada alteração. Todos os monitores leem e atualizam o estado compartilhado no PostgreSQL.
- **Mapa:** proporção 1010 × 980, com estado disponível, ocupado ou bloqueado.
- **Contrato da API:** OpenAPI 3 em [`docs/openapi.yaml`](./docs/openapi.yaml).
- **Documento técnico:** [`docs/Documento-Tecnico-TED3.md`](./docs/Documento-Tecnico-TED3.md).

O banco serializa as transições concorrentes por transação e bloqueio das salas, evitando que duas instâncias sobrescrevam mudanças independentes. Para uso público, publique atrás de HTTPS e configure `DATABASE_URL` por meio dos secrets do provedor. Não exponha a API sem TLS.

## Requisitos

- Node.js 20.19 ou superior
- npm
- PostgreSQL 14 ou superior (local ou serviço gerenciado)

## Configuração local

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` com a URL do PostgreSQL e defina a conta inicial do coordenador:

```text
DATABASE_URL=postgresql://usuario:senha@localhost:5432/snct_flow
SNCT_ADMIN_USERNAME=coordenador
SNCT_ADMIN_PASSWORD=<senha-com-pelo-menos-12-caracteres>
```

Crie no PostgreSQL o banco `snct_flow` e um usuário com permissão de criar/alterar as tabelas da aplicação. Os scripts de esquema são aplicados na inicialização; as salas de demonstração são inseridas somente se a tabela estiver vazia. Se existir `.data/rooms.json` da versão anterior, ela é importada uma vez para o banco e convertida para os três estados.

Crie o primeiro coordenador (a operação falha se já houver um):

```bash
npm run create-admin
```

Não reutilize a senha de exemplo. Guarde credenciais e `DATABASE_URL` em variáveis de ambiente ou no gerenciador de secrets da hospedagem; não as envie ao Git.

## Executar em desenvolvimento

Terminal 1:

```bash
npm run api
```

Terminal 2:

```bash
npm run dev
```

Abra `http://localhost:5173`, entre com a conta do coordenador e cadastre usuários individuais para os monitores. O Vite encaminha `/api` à API local.

## Publicar em produção

Configure no provedor `DATABASE_URL`, `NODE_ENV=production` e `PORT` (além dos secrets exigidos pelo provedor PostgreSQL). Faça o build e inicie o servidor:

```bash
npm ci
npm run build
npm start
```

Em produção o servidor atende o build e a API na mesma origem e escuta em `0.0.0.0` por padrão. O HTTPS deve ser terminado na plataforma ou em um proxy reverso confiável; configure o domínio para encaminhar à porta `PORT`. Execute `npm run create-admin` uma vez contra o banco de produção, com `SNCT_ADMIN_USERNAME` e `SNCT_ADMIN_PASSWORD` definidos como secrets. O serviço de aplicação precisa de acesso de rede ao PostgreSQL.

## Regras dos estados

- Entrada: `available` → `occupied`.
- Saída: `occupied` → `available`.
- Bloqueio: `available` ou `occupied` → `blocked`.
- Desbloqueio: `blocked` → `available`.

O estado repetido é idempotente; transições incompatíveis recebem `409`.

## Endpoints

| Método | Endpoint | Acesso |
|---|---|---|
| `GET` | `/api/health` | Público |
| `POST` | `/api/auth/login` | Público |
| `GET` | `/api/auth/me` | Autenticado |
| `POST` | `/api/auth/logout` | Sessão atual |
| `POST` | `/api/users` | Coordenador |
| `GET` | `/api/rooms` | Monitor ou coordenador |
| `GET` | `/api/rooms/{roomId}` | Monitor ou coordenador |
| `PATCH` | `/api/rooms/{roomId}/status` | Monitor ou coordenador |

O login bloqueia temporariamente novas tentativas após 10 falhas em 15 minutos para o nome de usuário. Consulte o OpenAPI para payloads e respostas.

## Testes

```bash
npm test
npm run lint
npm run build
```

## Histórico do projeto

- **TED 1:** planejamento inicial.
- **TED 2:** interface responsiva, mapa e interação com dados simulados.
- **TED 3:** API, mapa interativo, estados simplificados, autenticação, autorização, PostgreSQL e atualização periódica compartilhada.

O README anterior da TED 2 foi a referência disponível para a evolução; o documento formal da TED 1 não estava no repositório.
