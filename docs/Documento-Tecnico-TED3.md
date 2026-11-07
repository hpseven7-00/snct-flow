# Documento Técnico do Projeto — Versão 3.0

## Identificação

- **Projeto:** SNCT Flow
- **Versão deste documento:** 3.0
- **Data:** 7 de novembro de 2026
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
3. **Persistência:** arquivo JSON local, inicializado a partir de `server/seed-data.json` na primeira execução. As alterações são gravadas em arquivo temporário e renomeadas para substituir o arquivo de dados.
4. **Integração de desenvolvimento:** o proxy do Vite encaminha `/api` para `http://127.0.0.1:3001`.

Não há banco relacional nesta versão; portanto, scripts SQL ou migrações não se aplicam. A solução é adequada ao MVP local e a uma única instância da API. Para implantação multiusuário ou concorrente, deve-se migrar para banco transacional e coordenar as instâncias.

### Diagrama de componentes

```text
Navegador (React + TypeScript)
       │ HTTP/JSON em /api
       ▼
Proxy Vite (desenvolvimento) ──► API Node.js (127.0.0.1:3001)
                                     │
                                     ├── regras e validações
                                     └── .data/rooms.json
                                           ▲
                                           └── seed-data.json (primeira execução)
```

## 2. Justificativa de alterações em relação ao planejamento

O planejamento formal da TED 1 não foi disponibilizado neste repositório, então não é possível comparar decisões com o documento original. Em relação à arquitetura registrada na TED 2, a principal evolução foi substituir o estado simulado no navegador por uma API e persistência no servidor.

Para este MVP foi adotado JSON local em vez de banco de dados externo, evitando infraestrutura e dependências adicionais e mantendo os dados entre reinicializações. A camada usa apenas módulos nativos do Node.js. Esta decisão é intencionalmente limitada a uma execução local e não substitui uma solução multiusuário em produção.

## 3. Modelagem dos dados

O arquivo `.data/rooms.json` contém uma lista de objetos `Room`:

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string | Identificador único da sala |
| `name` | string | Nome de exibição |
| `local` | string | Bloco ou localização |
| `capacity` | número positivo | Capacidade de referência em pessoas |
| `unavailable` | boolean | Indica bloqueio temporário |
| `groups` | lista de `Group` | Grupos atualmente registrados na sala |
| `presentations` | lista de strings | Atividades previstas para a sala |

Cada `Group` possui `id`, `size` e `enteredAt`. Os tamanhos válidos e seus pesos de ocupação são: Pequeno (5), Médio (10), Grande (25) e Muito grande (40). O percentual de ocupação é calculado como soma dos pesos dividida pela capacidade. A capacidade é usada como referência visual: o MVP não impede entradas que ultrapassem 100%, preservando o comportamento anterior.

## 4. Funcionalidades e regras de negócio

- Consultar todas as salas ou uma sala por identificador.
- Registrar entrada somente com um dos quatro tamanhos permitidos e em sala disponível.
- Registrar saída removendo o último grupo; uma sala vazia resulta em conflito `409`.
- Alterar disponibilidade usando valor booleano.
- Retornar erros JSON com código e mensagem; requisições inválidas recebem `400`, recursos ausentes `404`, conflitos de regra `409` e corpos maiores que 16 KiB `413`.
- Serializar gravações na instância da API e somente atualizar o estado em memória após persistência bem-sucedida.

## 5. Autenticação e autorização

Esta versão não implementa autenticação ou papéis de usuário: o MVP destina-se a uma demonstração operada localmente, sem contas ou perfis previstos no material disponível. A API escuta por padrão somente em `127.0.0.1`, evitando exposição à rede. Não se deve expor a API publicamente ou usar dados reais sem acrescentar autenticação, autorização, TLS e controles operacionais apropriados.

## 6. Integração e endpoints

A interface inicializa consultando `GET /api/rooms`. Ações de entrada, saída e disponibilidade são enviadas à API; após sucesso, a interface consulta novamente os dados persistidos. Falhas são apresentadas na própria interface e não são tratadas como sucesso.

| Método | Endpoint | Finalidade |
|---|---|---|
| `GET` | `/api/health` | Verificar disponibilidade |
| `GET` | `/api/rooms` | Listar salas |
| `GET` | `/api/rooms/{roomId}` | Consultar sala |
| `POST` | `/api/rooms/{roomId}/groups` | Registrar entrada; corpo `{"size":"Pequeno"}` |
| `DELETE` | `/api/rooms/{roomId}/groups` | Registrar saída do último grupo |
| `PATCH` | `/api/rooms/{roomId}/availability` | Alterar disponibilidade; corpo `{"unavailable":true}` |

A especificação OpenAPI 3 está em [`openapi.yaml`](./openapi.yaml).

## 7. Instalação e execução

Requisitos: Node.js 20.19+ e npm.

```bash
npm install
```

Em um terminal, iniciar a API:

```bash
npm run api
```

Em outro terminal, iniciar a interface:

```bash
npm run dev
```

O Vite disponibiliza a aplicação em `http://localhost:5173`. A primeira inicialização da API cria `.data/rooms.json` a partir do seed. Para personalizar porta, host ou arquivo de dados, use `PORT`, `HOST` ou `SNCT_DATA_FILE`. Mantenha `HOST=127.0.0.1` em uso local.

## 8. Testes e resultados

Comandos de validação:

```bash
npm test
npm run lint
npm run build
```

Os testes automatizados verificam regras de entrada/saída e disponibilidade, validação de payload, respostas HTTP, persistência após reinicialização do repositório e erros de entrada.

**Resultados desta implementação:** `npm test` — 6 testes aprovados; `npm run lint` — aprovado sem avisos; `npm run build` — compilação TypeScript e build Vite aprovados.

## 9. Dificuldades e soluções

- **Dados simulados não persistiam:** as ações foram conectadas a uma API e a gravações em arquivo JSON.
- **Falhas de rede ou de regra poderiam parecer sucesso na interface:** a API usa status e mensagens consistentes e a interface exibe falhas e permite repetir o carregamento.
- **Ausência do documento formal da TED 1 no repositório:** a arquitetura foi alinhada ao código disponível e a limitação foi registrada, sem inventar decisões atribuídas ao planejamento original.

## 10. Histórico de versões

| Versão | Etapa | Alterações |
|---|---|---|
| 1.0 | TED 1 | Planejamento inicial; documento formal não localizado no repositório recebido. |
| 2.0 | TED 2 | Interface responsiva, dashboard e interações locais com dados simulados, conforme README existente. |
| 3.0 | TED 3 | API REST Node.js, regras de domínio, persistência JSON, integração com React, testes e especificação OpenAPI. |
