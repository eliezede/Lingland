# Airtable Sync Center - Implementation Plan

> Bookmark principal para organizar a transicao Airtable -> Lingland Platform de forma cirurgica, auditavel e a prova de erros.

## Bookmarks

- [1. Objetivo operacional](#1-objetivo-operacional)
- [2. Situacao atual da plataforma](#2-situacao-atual-da-plataforma)
- [3. Estado final esperado](#3-estado-final-esperado)
- [4. Principios de arquitetura](#4-principios-de-arquitetura)
- [5. Ordem obrigatoria de sincronizacao](#5-ordem-obrigatoria-de-sincronizacao)
- [6. Fases de implementacao](#6-fases-de-implementacao)
- [7. UI/UX final do Sync Center](#7-uiux-final-do-sync-center)
- [8. Jobs Board final](#8-jobs-board-final)
- [9. Booking Detail final](#9-booking-detail-final)
- [10. Billing e invoices](#10-billing-e-invoices)
- [11. Status mapping](#11-status-mapping)
- [12. Test Mode, Mirror Mode e go-live](#12-test-mode-mirror-mode-e-go-live)
- [13. Auditoria e reconciliacao](#13-auditoria-e-reconciliacao)
- [14. Definition of Done geral](#14-definition-of-done-geral)
- [15. Checklist mestre](#15-checklist-mestre)

## 1. Objetivo operacional

Criar um espelho confiavel do Airtable dentro da Lingland Platform durante a fase de transicao, sem enviar emails externos e sem obrigar interpretes/clientes a usarem a nova plataforma antes do go-live.

Depois do go-live, a plataforma deixa de ser apenas espelho e passa a ser o sistema principal, mantendo a capacidade hibrida:

- Admin pode executar qualquer etapa manualmente.
- Interprete/tradutor pode executar pela app quando estiver ativo.
- Cliente pode agendar diretamente pela plataforma quando os formularios novos substituirem Airtable.
- Airtable pode ser desativado sem perda historica.

## 2. Situacao atual da plataforma

### Ja existe

- Importacao de interpretes do Airtable.
- Sync de jobs de interpretacao a partir de `REDBOOK`.
- Sync de invoices de interpretacao a partir de `Invoices`.
- Sync de invoices/pagamentos de interpretes a partir de `INV interp`.
- Modelo interno com `ServiceCategory` para `INTERPRETATION` e `TRANSLATION`.
- Booking/timesheet/billing com suporte parcial para traducoes.
- Plataforma limpa para nova carga:
  - Jobs atuais removidos.
  - Clientes atuais removidos.
  - Interpretes preservados.
  - Usuarios preservados.

### Ainda nao existe ou esta incompleto

- Importacao completa de clientes a partir de `Clients` e `Clients Book`.
- Importacao de traducoes a partir de `Translations`.
- Importacao de pedidos web de traducao a partir de `Web translations`.
- Importacao de invoices de traducao a partir de `TR invoices`.
- Importacao de pagamentos/invoices de tradutores a partir de `INV TR`.
- UI de migracao organizada por dependencias.
- Reconciliacao clara entre Airtable e plataforma.
- Jobs Board totalmente preparado para interpretacao + traducao.
- Booking Detail contextual para traducao.

## 3. Estado final esperado

A plataforma deve operar como um sistema unico para:

- Interpretacao presencial/remota.
- Traducao de documentos.
- Clientes, departamentos e booking agents.
- Interpretes e tradutores.
- Assignment manual ou por proposta.
- Status operacional.
- Timesheets.
- Invoices de cliente.
- Pagamentos de interpretes/tradutores.
- Auditoria Airtable vs plataforma.

Traducoes nao devem virar uma plataforma separada. Devem entrar como `serviceCategory: TRANSLATION` dentro do mesmo fluxo operacional e financeiro.

## 4. Principios de arquitetura

1. Clientes primeiro.
   Jobs nao devem criar clientes fracos como estrategia principal. Isso pode existir apenas como fallback controlado.

2. Pessoas antes de trabalho.
   Interpretes/tradutores precisam existir antes de assignment, invoices e historico.

3. Jobs antes de invoices.
   Invoice line sem job vinculado vira dado financeiro orfao.

4. Dry Run antes de Sync.
   Toda importacao precisa ter preview, contadores, exemplos e conflitos antes de escrever no Firestore.

5. Idempotencia obrigatoria.
   Rodar o mesmo sync duas vezes nao pode duplicar jobs, clientes, invoices ou invoice lines.

6. Source tracking obrigatorio.
   Cada entidade importada precisa guardar `sourceSystem`, `sourceTable`, `sourceRecordId`, `legacyRef`, `snapshotHash` e `lastSyncedAt`.

7. Admin sempre pode operar manualmente.
   A plataforma deve funcionar mesmo quando o interprete nao usa a app ou quando Airtable ainda e usado em paralelo.

8. Emails externos bloqueaveis.
   Test Mode/Mirror Mode deve impedir envio externo, preservando logs internos.

## 5. Ordem obrigatoria de sincronizacao

```text
1. Clients / Clients Book
2. Interpreters / Translators
3. REDBOOK interpretation jobs
4. Translations / Web translations
5. Client invoices
6. Interpreter / translator invoices
7. Status reconciliation
8. Audit report
```

Essa ordem deve ser respeitada no botao `Full Sync`.

## 6. Fases de implementacao

### Fase 0 - Base tecnica e configuracao

- [ ] Criar mapa central de tabelas Airtable.
- [ ] Trocar dependencia de nomes frageis/emoji por field ids ou aliases normalizados.
- [ ] Adicionar `sourceTable` e `sourceView` onde fizer sentido.
- [ ] Criar estrutura de `syncRuns` para historico de Dry Run e Sync real.
- [ ] Criar estrutura de `syncConflicts`.

Aceite:

- Dry Run consegue reportar entidades sem escrever no Firestore.
- Cada sync gera log persistente.
- Erros sao visiveis para admin.

### Fase 1 - Clientes

Tabelas:

- `Clients`
- `Clients Book`

Campos importantes:

- Nome institucional.
- Booking agent.
- Email de booking.
- Telefone.
- Endereco.
- Postcode.
- Invoice contact.
- Invoice email.
- Sage Account Ref.
- Unique Client Key.
- Client category/status.

Implementacao:

- [ ] Criar importador standalone de clientes.
- [ ] Criar dedupe por `uniqueClientKey`, email, Sage ref e nome normalizado.
- [ ] Preservar relacao com departamentos/booking agents quando existir.
- [ ] Expor Dry Run na UI.
- [ ] Expor conflitos de duplicidade.

Aceite:

- Jobs futuros resolvem cliente contra base importada.
- Nenhum cliente duplicado obvio e criado sem conflito visivel.

### Fase 2 - Interpretes e tradutores

Tabelas:

- Tabela atual de interpretes importados.
- Relacoes vindas de `REDBOOK`, `Translations`, `TR invoices`, `INV TR`.

Implementacao:

- [ ] Garantir match por email.
- [ ] Garantir match por nome normalizado quando email faltar.
- [ ] Marcar usuarios importados como passivos quando nao ativados.
- [ ] Permitir assignment manual para usuario passivo.
- [ ] Bloquear emails externos em Test Mode.

Aceite:

- Interprete/tradutor pode ter historico mesmo sem ter ativado conta.
- Admin pode marcar aceite/recusa manualmente.

### Fase 3 - REDBOOK interpretation jobs

Tabela:

- `REDBOOK`

Implementacao:

- [ ] Usar clientes importados como fonte principal.
- [ ] Resolver interprete assignado.
- [ ] Preservar job id legado no formato Airtable quando existir.
- [ ] Mapear status operacional.
- [ ] Mapear financeiro.
- [ ] Criar eventos de auditoria.
- [ ] Nao enviar comunicacao externa em Test Mode.

Aceite:

- Job importado aparece corretamente na Jobs Board.
- Assignment vindo do Airtable aparece como assignment/passive assignment.
- Status fica coerente com o fluxo interno.

### Fase 4 - Translation jobs

Tabelas:

- `Translations`
- `Web translations`

Campos importantes:

- `TR NUMBER`
- `TR Status`
- `LANGUAGE`
- `Assign to TR`
- `TR Requested By`
- `TR Agency`
- `TR client email`
- `Document to Translate`
- `Format for client`
- `WORD COUNT`
- `Number of docs`
- `Needs quote?`
- `FINAL QUOTE`
- `COMPLETED`
- `TR Notes`
- `TR ID`
- `TR FORM LINK`

Implementacao:

- [ ] Importar traducoes como `bookings`.
- [ ] Definir `serviceCategory: TRANSLATION`.
- [ ] Resolver cliente.
- [ ] Resolver tradutor/interprete.
- [ ] Mapear documentos/anexos quando disponiveis.
- [ ] Mapear quote, word count, docs e delivery.
- [ ] Mapear status proprio de traducao para status interno.
- [ ] Importar `Web translations` como leads/jobs de traducao quando aplicavel.

Aceite:

- Traducao aparece na mesma Jobs Board.
- Traducao tem destaque visual e colunas especificas opcionais.
- Booking Detail mostra fluxo de traducao, nao campos irrelevantes de interpretacao.

### Fase 5 - Client invoices

Tabelas:

- `Invoices`
- `TR invoices`

Implementacao:

- [ ] Importar invoices de interpretacao para `clientInvoices`.
- [ ] Importar invoices de traducao para `clientInvoices`.
- [ ] Criar invoice lines ligadas aos jobs.
- [ ] Definir categoria fiscal por servico.
- [ ] Mapear status pago/nao pago/verificado.
- [ ] Evitar duplicacao por invoice number + source record id.

Aceite:

- Finance ve interpretacao e traducao no mesmo fluxo.
- Invoice line aponta para job real.
- Jobs ficam com billing readiness correta.

### Fase 6 - Interpreter / translator invoices

Tabelas:

- `INV interp`
- `INV TR`

Implementacao:

- [ ] Importar pagamentos de interpretes.
- [ ] Importar pagamentos de tradutores.
- [ ] Resolver pessoa por email/nome.
- [ ] Resolver job por REDBOOK/TR number.
- [ ] Mapear word count, docs, fees e comments para translation payment lines.
- [ ] Unificar visualmente em fila de pagamentos.

Aceite:

- Interprete/tradutor ve historico financeiro quando ativar conta.
- Admin consegue auditar valores a pagar.

### Fase 7 - UI/UX do Sync Center

- [ ] Substituir tabs simples por workflow modular.
- [ ] Criar status cards compactos por entidade.
- [ ] Criar tabela de preview para Dry Run.
- [ ] Criar painel de conflitos.
- [ ] Criar botao `Full Dry Run`.
- [ ] Criar botao `Full Sync`.
- [ ] Mostrar dependencia bloqueante quando fase anterior nao rodou.

Aceite:

- Admin entende o que sera criado, atualizado, ignorado e conflitado antes de executar.
- A tela funciona como cockpit de transicao, nao como pagina tecnica solta.

### Fase 8 - Jobs Board e Booking Detail

- [ ] Adicionar filtro por service category.
- [ ] Adicionar views para interpretacao/traducao/billing.
- [ ] Adicionar colunas ocultaveis de traducao.
- [ ] Corrigir highlight e densidade visual.
- [ ] Garantir modal/side drawer em row click.
- [ ] Garantir full page apenas em double click ou acao explicita.
- [ ] Booking Detail deve ter mesmo shell para view/edit.

Aceite:

- Admin consegue trabalhar como numa lista tipo Airtable, mas com fluxo operacional melhor.
- Traducao nao polui interpretacao e interpretacao nao quebra traducao.

### Fase 9 - Reconciliacao e go-live readiness

- [ ] Relatorio Airtable vs plataforma.
- [ ] Jobs faltantes.
- [ ] Clientes faltantes.
- [ ] Interpretes sem match.
- [ ] Invoices sem job.
- [ ] Jobs sem invoice quando deveriam ter.
- [ ] Divergencia de status.
- [ ] Divergencia de valores.

Aceite:

- Antes do go-live, admin consegue provar que os dados batem com Airtable.

## 7. UI/UX final do Sync Center

Layout recomendado:

```text
Header
  Airtable Sync Center
  Mode badges: MIRROR MODE / EMAIL INTERNAL ONLY / IMPORT ON

Left workflow rail
  Overview
  Clients
  Interpreters
  Interpretation Jobs
  Translation Jobs
  Client Invoices
  Interpreter/Translator Invoices
  Full Sync
  Audit

Main workspace
  Module status
  Dry Run / Sync Now
  Last run
  Counts
  Conflicts
  Preview table
```

Cada modulo deve mostrar:

- Records found.
- Would create.
- Would update.
- Would skip.
- Conflicts.
- Missing dependencies.
- Last synced at.
- Source table/view.

## 8. Jobs Board final

Views essenciais:

- All Jobs
- Interpreting
- Translations
- Incoming
- Needs Assignment
- Pending Quote
- Delivery Due
- Timesheets
- Invoice Ready
- Overdue
- Cancelled

Colunas essenciais:

- Job number.
- Service.
- Status.
- Booked for / due date.
- Client.
- Language.
- Interpreter/translator.
- Location or delivery.
- Duration or word count.
- Billing status.
- Contact.
- Actions.

Interacoes:

- Row click abre drawer/modal.
- Double click abre pagina completa.
- Right click abre contexto.
- Bulk selection ativa bulk actions.
- Views podem ocultar/mostrar campos.

## 9. Booking Detail final

Uma mesma ficha com paineis contextuais.

### Interpretacao

- Session and location.
- Language and service.
- Assignment.
- Contact.
- Timesheet.
- Billing.
- Messages/events.

### Traducao

- Document/source files.
- Language.
- Format.
- Word count.
- Number of docs.
- Quote.
- Deadline/delivery.
- Translator.
- Completion.
- Billing.
- Messages/events.

View e Edit devem compartilhar a mesma estrutura visual.

## 10. Billing e invoices

Modelo final:

```text
Booking
  serviceCategory

ClientInvoice
  sourceSystem
  sourceTable
  sourceRecordId

ClientInvoiceLine
  bookingId
  serviceCategory
  amount

InterpreterInvoice
  personId
  sourceSystem
  sourceTable
  sourceRecordId

InterpreterInvoiceLine
  bookingId
  serviceCategory
  units
  wordCount
  amount
```

Interpretacao e traducao entram no mesmo fluxo financeiro, diferenciadas por `serviceCategory` e categoria fiscal.

## 11. Status mapping

Status do Airtable deve ser preservado e tambem traduzido para status interno.

Campos recomendados em booking:

- `status`
- `airtableOperationalStatus`
- `airtableFinancialStatus`
- `airtableStatusSignals`
- `sourceStatusRaw`
- `statusMappedAt`

Regra:

- Nunca perder o status original do Airtable.
- Nunca depender apenas do texto original para operar na plataforma.
- Divergencia deve aparecer em Audit.

## 12. Test Mode, Mirror Mode e go-live

### Test Mode / Mirror Mode

- Importacao permitida.
- Emails externos bloqueados.
- Notificacoes internas permitidas.
- Admin pode simular aceite/recusa.
- Admin pode marcar timesheet recebido.
- Admin pode gerar/validar invoice manualmente.

### Go-live parcial

- Clientes novos usam formularios da plataforma.
- Airtable pode continuar como referencia temporaria.
- Interpretes podem ativar app gradualmente.
- Admin continua com modo manual.

### Go-live total

- Airtable deixa de receber novos pedidos.
- Sync vira read-only/audit ou fica desativado.
- Plataforma se torna source of truth.

## 13. Auditoria e reconciliacao

Relatorios obrigatorios:

- Airtable record sem entidade correspondente.
- Entidade na plataforma sem source record.
- Cliente duplicado.
- Interprete/tradutor duplicado.
- Job sem cliente.
- Job sem pessoa assignada quando Airtable indica assignment.
- Invoice sem job.
- Payment sem interprete/tradutor.
- Valor divergente.
- Status divergente.

Cada item deve ter:

- Severidade.
- Entidade.
- Source table.
- Source record id.
- Acao recomendada.

## 14. Definition of Done geral

Uma fase so esta pronta quando:

- Dry Run funciona.
- Sync real funciona.
- Sync e idempotente.
- UI mostra contadores e conflitos.
- Erros sao recuperaveis.
- Dados importados aparecem corretamente nas paginas operacionais.
- Jobs Board continua utilizavel em desktop e mobile.
- Dark mode nao quebra contraste.
- Fluxo manual admin existe para casos em que usuario final nao opera a app.
- Nenhum email externo e enviado em Test Mode.

## 15. Checklist mestre

### Data foundation

- [ ] Source tracking padronizado.
- [ ] Sync runs persistidos.
- [ ] Conflicts persistidos.
- [ ] Field mapping centralizado.
- [ ] Dry Run padronizado.

### Imports

- [ ] Clients.
- [ ] Clients Book.
- [ ] Interpreters.
- [ ] REDBOOK.
- [ ] Translations.
- [ ] Web translations.
- [ ] Invoices.
- [ ] TR invoices.
- [ ] INV interp.
- [ ] INV TR.

### Operations

- [ ] Assignment manual direto.
- [ ] Proposta enviada manualmente.
- [ ] Aceite manual.
- [ ] Recusa manual.
- [ ] Timesheet manual.
- [ ] Invoice manual.
- [ ] Status manual com audit trail.

### UI/UX

- [ ] Sync Center redesenhado.
- [ ] Jobs Board service-aware.
- [ ] Booking Detail unificado.
- [ ] Booking Edit unificado.
- [ ] Billing queues service-aware.
- [ ] Interpreter app historico service-aware.
- [ ] Mobile friendly.
- [ ] Dark mode validado.

### Go-live

- [ ] Mirror Mode validado.
- [ ] Emails externos bloqueados em teste.
- [ ] Reconciliacao Airtable vs plataforma aprovada.
- [ ] Import full executado.
- [ ] Novos formularios ativados.
- [ ] Airtable intake desativado.
- [ ] Sync fica como audit/read-only ou e removido da operacao diaria.
