# SNCT Flow

SNCT Flow é uma interface web desenvolvida para apoiar a gestão do fluxo de visitantes em eventos científicos, especialmente na Semana Nacional de Ciência e Tecnologia (SNCT). A aplicação apresenta um mapa das salas com indicadores de ocupação, ajudando monitores e organização a decidir rapidamente onde encaminhar grupos.

## Objetivo da TED 2

Implementar a interface da aplicação conforme o planejamento da TED 1, priorizando:

- usabilidade;
- responsividade;
- acessibilidade;
- organização visual das principais telas;
- interação com o mapa de salas e movimentação de grupos.

## Funcionalidades implementadas

- dashboard de ocupação por sala;
- indicação visual de status por cor e rótulo;
- registro de entrada de grupos por tamanho;
- registro de saída de grupos;
- bloqueio ou liberação de sala;
- exibição de apresentações por ambiente;
- layout responsivo para celulares, tablets e computadores.

## Tecnologias utilizadas

- React
- TypeScript
- Vite
- Tailwind CSS

## Requisitos

- Node.js 18+
- npm

## Instalação

```bash
npm install
```

## Execução em ambiente de desenvolvimento

```bash
npm run dev -- --host 0.0.0.0
```

A aplicação estará disponível em:

```text
http://localhost:5173/
```

## Build de produção

```bash
npm run build
```

## Fases da implementação

### Fase 1 — Estrutura inicial

- criação do projeto com Vite + React + TypeScript;
- definição do layout base e paleta visual;
- estruturação do dashboard e do mapa das salas.

### Fase 2 — Interações e lógica da interface

- seleção de sala;
- cálculo de ocupação por capacidade e peso dos grupos;
- ações de entrada, saída e indisponibilidade;
- atualização visual em tempo real local.

### Fase 3 — Revisão e documentação

- ajustes de responsividade e acessibilidade;
- validação do build;
- organização do README e documentação técnica.

## Observações

A versão atual da TED 2 foca na interface front-end e usa dados simulados para reproduzir o comportamento esperado do MVP descrito no documento técnico da TED 1.
