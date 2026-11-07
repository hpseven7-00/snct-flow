# SNCT Flow

O SNCT Flow apoia a gestão do fluxo de visitantes em eventos científicos, como a Semana Nacional de Ciência e Tecnologia. O dashboard exibe um mapa interativo do campus com o estado de cada sala: disponível, ocupada ou bloqueada.

## Arquitetura

- **Interface:** React, TypeScript, Vite e Tailwind CSS.
- **API:** servidor HTTP nativo do Node.js com endpoints REST e payloads JSON.
- **Persistência:** arquivo local `.data/rooms.json`, criado com dados de demonstração de [`server/seed-data.json`](./server/seed-data.json). Dados da versão anterior são migrados automaticamente para os três estados.
- **Contrato da API:** OpenAPI 3 em [`docs/openapi.yaml`](./docs/openapi.yaml).
- **Documento técnico TED 3:** [`docs/Documento-Tecnico-TED3.md`](./docs/Documento-Tecnico-TED3.md).

O arquivo JSON preserva as alterações após reiniciar a API. Entrada muda uma sala disponível para ocupada; saída libera uma sala ocupada; um único botão alterna entre bloquear e desbloquear. Não é mantida contagem ou categoria de grupos. Esta arquitetura atende à demonstração local com uma instância; não é destinada a acesso público ou operação concorrente multiusuário. Autenticação não está implementada no MVP. A API escuta por padrão apenas em `127.0.0.1`.

## Requisitos

- Node.js 20.19 ou superior
- npm

## Instalação e execução

```bash
npm install
```

Inicie a API em um terminal:

```bash
npm run api
```

Inicie a interface em outro terminal:

```bash
npm run dev
```

A aplicação estará em `http://localhost:5173`. O proxy de desenvolvimento encaminha as chamadas `/api` para `http://127.0.0.1:3001`.

Configurações opcionais da API: `PORT` (padrão `3001`), `HOST` (padrão `127.0.0.1`) e `SNCT_DATA_FILE` (arquivo JSON alternativo).

## API

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/health` | Verificação de saúde |
| `GET` | `/api/rooms` | Lista salas |
| `GET` | `/api/rooms/{roomId}` | Consulta uma sala |
| `PATCH` | `/api/rooms/{roomId}/status` | Atualiza estado (`{"status":"occupied"}`) |

Consulte a especificação OpenAPI para schemas, respostas e exemplos.

## Validação

```bash
npm test
npm run lint
npm run build
```

Os testes usam o runner nativo `node:test` e não exigem serviços externos.

## Evolução do projeto

- **TED 1:** planejamento inicial.
- **TED 2:** interface responsiva, mapa de salas e interações com estado simulado no navegador.
- **TED 3:** API, regras de negócio, persistência e integração com o dashboard.

O documento formal da TED 1 não estava presente no repositório recebido. Essa limitação e as informações anteriores disponíveis foram registradas no documento técnico da TED 3.
