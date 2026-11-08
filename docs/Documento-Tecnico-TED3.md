# Documento Técnico do Projeto — Versão 3.2

## Identificação

- **Projeto:** SNCT Flow
- **Versão deste documento:** 3.2
- **Data:** 8 de novembro de 2026
- **Link do Repositório:** https://github.com/hpseven7-00/snct-flow
- **Finalidade:** registrar a implementação do back-end e sua integração com o MVP de gestão da ocupação de salas da Semana Nacional de Ciência e Tecnologia.

> **Histórico das TEDs anteriores:** a TED 2 é a referência adotada para esta evolução. O README existente registra seu objetivo, funcionalidades e tecnologias; esse conteúdo foi preservado e consolidado neste documento. O planejamento formal da TED 1 não está disponível no repositório e não foi usado para presumir requisitos além dos registrados na TED 2.

## Conteúdo anterior preservado

### Objetivo e escopo anteriores

O SNCT Flow apoia a gestão do fluxo de visitantes em eventos científicos por meio de um mapa de salas com indicadores de ocupação. A interface da TED 2 priorizou usabilidade, responsividade, acessibilidade, seleção de salas, registro de entrada e saída de grupos e bloqueio ou liberação de ambientes.

### Funcionalidades anteriores

- dashboard com total de salas, salas disponíveis e ocupação ativa;
- mapa de salas com indicador de ocupação, localização e status;
- registro de entrada de grupos de quatro tamanhos;
- registro de saída do último grupo;
- bloqueio e liberação de salas;
- apresentação dos grupos presentes e das atividades previstas em cada sala;
- interface responsiva.

### Tecnologias anteriores

React, TypeScript, Vite e Tailwind CSS. A versão da TED 2 mantinha os dados simulados apenas no estado local da interface.

## 1. Arquitetura implementada

A aplicação segue uma arquitetura cliente-servidor em um único repositório:

1. **Interface:** React + TypeScript. Busca as salas e envia comandos à API por HTTP/JSON.
2. **API:** servidor HTTP nativo do Node.js, com rotas REST, validações, regras de domínio e respostas de erro padronizadas.
3. **Persistência:** PostgreSQL compartilhado, acessado pelo driver `pg`. `server/schema.sql` cria as tabelas necessárias; na primeira inicialização, o servidor importa as salas locais antigas, se existirem, ou usa `server/seed-data.json`.
4. **Autenticação:** contas individuais de coordenador e monitores, sessões persistidas no banco e cookie de sessão protegido.
5. **Integração de desenvolvimento:** o proxy do Vite encaminha `/api` para `http://127.0.0.1:3001`. Em produção, o servidor Node.js pode servir a interface compilada e a API pela mesma origem.

O PostgreSQL compartilhado permite que vários monitores e instâncias da API operem sobre os mesmos dados. As alterações de sala são executadas em transações e bloqueiam as linhas antes de aplicar as regras de domínio.

### Diagrama de componentes

```text
Navegadores dos monitores
       │ HTTP/JSON + cookie de sessão; consulta a cada 5 s
       ▼
API Node.js ◄── Proxy Vite (desenvolvimento)
       │
       ├── autenticação, autorização e regras de domínio
       ├── schema.sql + seed/importação inicial
       ▼
PostgreSQL compartilhado
  ├── rooms
  ├── users
  ├── sessions
  └── login_attempts
```

Em produção, o proxy de desenvolvimento é substituído pelo servidor Node.js servindo `dist` e `/api` na mesma origem. A plataforma de hospedagem deve fornecer HTTPS e configurar `DATABASE_URL` por meio de secrets.

## 2. Justificativa de alterações em relação ao planejamento

O planejamento formal da TED 1 não foi disponibilizado neste repositório, então não é possível comparar decisões com o documento original. Em relação à arquitetura registrada na TED 2, a aplicação evoluiu do estado simulado no navegador para uma API e persistência compartilhada.

A persistência JSON inicialmente usada no desenvolvimento foi substituída por PostgreSQL para atender ao uso simultâneo por vários monitores e permitir múltiplas instâncias do serviço. As transações e os bloqueios de linha evitam atualizações concorrentes inconsistentes. A hospedagem ainda deve ser definida; a implantação requer PostgreSQL acessível pela aplicação, configuração segura de `DATABASE_URL` e HTTPS.

Nesta evolução, a grade de cartões foi substituída por um mapa interativo do campus inspirado no protótipo fornecido, com proporção da planta de 1010 × 980. O mapa mostra cada sala na localização visual de seu bloco e usa cores para Disponível, Ocupada e Bloqueada. Um único botão alterna a sala entre bloqueada e desbloqueada.

## 3. Modelagem dos dados

O banco PostgreSQL mantém as entidades abaixo; a definição executável está em [`../server/schema.sql`](../server/schema.sql):

| Tabela | Campos principais | Finalidade |
|---|---|---|
| `rooms` | `id`, `name`, `local`, `status`, `presentations`, `updated_at` | Salas, com estado limitado a `available`, `occupied` ou `blocked` |
| `users` | `id`, `username`, `password_hash`, `role`, `created_at` | Contas individuais; papéis `admin` e `monitor` |
| `sessions` | `token_hash`, `user_id`, `expires_at`, `created_at` | Sessões com token armazenado somente como hash e vínculo à conta |
| `login_attempts` | `username`, `failed_count`, `window_started_at` | Controle de tentativas malsucedidas por janela de tempo |

O identificador do usuário é UUID; `username` é único. A senha nunca é armazenada em texto puro: o servidor persiste um derivado `scrypt` com salt. Entradas e saídas não criam registros de grupo nem calculam quantidade de pessoas; o estado atual é a única informação de movimentação persistida.

## 4. Funcionalidades e regras de negócio

- Consultar todas as salas ou uma sala por identificador.
- Registrar entrada altera uma sala `available` para `occupied`.
- Registrar saída altera uma sala `occupied` para `available`.
- Bloquear altera uma sala `available` ou `occupied` para `blocked`; desbloquear altera `blocked` para `available`.
- A API rejeita transições incompatíveis (por exemplo, registrar entrada em sala bloqueada) com conflito `409`. Repetir o status atual é idempotente.
- Retornar erros JSON com código e mensagem; requisições inválidas recebem `400`, recursos ausentes `404`, conflitos de regra `409` e corpos maiores que 16 KiB `413`.
- Atualizar salas dentro de transação PostgreSQL, bloqueando as linhas antes de validar e aplicar a transição.

## 5. Autenticação e autorização

O coordenador inicial é criado uma única vez pelo comando `npm run create-admin`, usando `SNCT_ADMIN_USERNAME` e `SNCT_ADMIN_PASSWORD`. Depois do bootstrap, somente o coordenador autenticado pode criar contas individuais de monitores pela interface. As contas usam nomes de usuário normalizados e senhas de 12 a 200 caracteres.

O login cria uma sessão aleatória com validade de 12 horas. O token é enviado em cookie `HttpOnly`, `SameSite=Strict` e, em produção, `Secure`; apenas o hash do token fica no banco. O logout invalida a sessão. Após 10 falhas de login em 15 minutos para um nome de usuário, novas tentativas são temporariamente recusadas. Rotas de salas exigem sessão autenticada; a criação de contas exige papel `admin`. Requisições de alteração também verificam a origem. A implantação deve usar HTTPS e manter credenciais em secrets do provedor.

## 6. Integração e endpoints

A interface autentica o usuário, consulta `GET /api/rooms` e atualiza o mapa a cada 5 segundos. Entrada, saída, bloqueio e desbloqueio são enviados à API; após sucesso, a interface consulta novamente o estado persistido. Com o banco compartilhado, outros navegadores observam as alterações na próxima consulta (latência esperada de até aproximadamente 5 segundos, acrescida do tempo de rede). Falhas são apresentadas na própria interface e não são tratadas como sucesso.

| Método | Endpoint | Finalidade |
|---|---|---|
| `GET` | `/api/health` | Verificar disponibilidade |
| `POST` | `/api/auth/login` | Autenticar e iniciar sessão |
| `GET` | `/api/auth/me` | Consultar usuário da sessão atual |
| `POST` | `/api/auth/logout` | Encerrar a sessão atual |
| `POST` | `/api/users` | Criar conta de monitor (coordenador) |
| `GET` | `/api/rooms` | Listar salas |
| `GET` | `/api/rooms/{roomId}` | Consultar sala |
| `PATCH` | `/api/rooms/{roomId}/status` | Registrar entrada, saída, bloqueio ou liberação; corpo `{"status":"occupied"}` |

A especificação OpenAPI 3, incluindo autenticação por cookie e esquemas das respostas, está em [`openapi.yaml`](./openapi.yaml).

Se o banco não tiver salas, a inicialização importa `.data/rooms.json` quando presente ou usa `server/seed-data.json`; essa carga inicial não substitui salas já existentes no banco. Dados antigos são convertidos para os três estados: salas indisponíveis tornam-se `blocked`; salas restantes com grupos registrados tornam-se `occupied`; salas vazias tornam-se `available`. Os campos antigos de quantidade e tamanho dos grupos não são persistidos.

## 7. Instalação e execução

Requisitos: Node.js 20.19+, npm e PostgreSQL 14+.

```bash
npm install
```

Configure `.env` com `DATABASE_URL`, `SNCT_ADMIN_USERNAME` e `SNCT_ADMIN_PASSWORD` (mínimo 12 caracteres para a senha inicial). Crie previamente o banco e conceda à aplicação permissão para criar e alterar as tabelas. Não versione `.env`; em produção use secrets do provedor.

Crie o coordenador inicial uma única vez:

```bash
npm run create-admin
```

Em desenvolvimento, iniciar a API e a interface em terminais separados:

```bash
npm run api
npm run dev
```

O Vite disponibiliza a aplicação em `http://localhost:5173` e encaminha `/api` à API local. Em produção, execute `npm ci`, `npm run build` e `npm start`; o servidor entrega o frontend compilado e a API na mesma origem. Configure `NODE_ENV=production`, `PORT`, `DATABASE_URL` e HTTPS na plataforma de hospedagem.

## 8. Testes e resultados

Comandos de validação:

```bash
npm test
npm run lint
npm run build
```

Os testes automatizados verificam transições de estado, migração de dados antigos, validação de payload, autenticação e autorização, limitação de tentativas e respostas HTTP.

**Resultados desta validação:** `npm test` — 13 testes aprovados; `npm run lint` — aprovado sem avisos; `npm run build` — compilação TypeScript e build Vite aprovados. Não foi possível validar uma conexão PostgreSQL ou implantação real neste ambiente porque não há `DATABASE_URL` configurada; a validação do banco em produção depende também do provedor escolhido.

## 9. Dificuldades e soluções

- **Dados simulados não eram compartilhados entre monitores:** a API foi integrada a um PostgreSQL compartilhado e a interface passou a consultar atualizações periodicamente.
- **Acesso concorrente e operação multiusuário:** foram adicionadas contas individuais, papéis, sessões protegidas, limitação de tentativas e atualizações transacionais.
- **Falhas de rede ou de regra poderiam parecer sucesso na interface:** a API usa status e mensagens consistentes e a interface exibe falhas e permite repetir o carregamento.
- **Ausência do documento formal da TED 1 no repositório:** a arquitetura foi alinhada ao código disponível e a limitação foi registrada, sem inventar decisões atribuídas ao planejamento original.

## 10. Histórico de versões

| Versão | Etapa | Alterações |
|---|---|---|
| 1.0 | TED 1 | Planejamento inicial; documento formal não localizado no repositório recebido. |
| 2.0 | TED 2 | Interface responsiva, dashboard e interações locais com dados simulados, conforme README existente. |
| 3.0 | TED 3 | API REST Node.js, regras de domínio, persistência inicial, integração com React, testes e especificação OpenAPI. |
| 3.1 | Ajuste da TED 3 | Mapa interativo do campus e estados simples disponível/ocupado/bloqueado, com migração dos dados existentes. |
| 3.2 | Evolução da TED 3 | PostgreSQL compartilhado, autenticação por sessão, papéis de coordenador/monitor, criação de contas, sincronização periódica e documentação dos endpoints. |
