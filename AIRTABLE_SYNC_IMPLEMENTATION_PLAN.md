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
- [16. Prova de reconciliacao financeira](#16-prova-de-reconciliacao-financeira)
- [17. Prova de identidade profissional](#17-prova-de-identidade-profissional)
- [18. Prova final de invoices e idempotencia](#18-prova-final-de-invoices-e-idempotencia)

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

- [x] Importar o diretorio profissional completo, incluindo `inactive`, `on leave`, `unreliable`, `only transl`, `Applicant` e status vazio.
- [x] Deduplicar somente com pares fortes de identidade: email+telefone, email+nome ou telefone+nome.
- [x] Preservar todos os Airtable record IDs e idiomas do mesmo profissional.
- [x] Garantir match deterministico por `sourceRecordId` e `airtableRecordIds`.
- [x] Manter perfis historicos/passivos mesmo sem email.
- [x] Criar conta somente para `active` e `only transl`.
- [x] Suspender acesso existente quando o status final deixar de ser elegivel para portal.
- [x] Preservar bloqueios locais `BLOCKED`, `SUSPENDED` e `ONBOARDING`.
- [x] Impedir merge automatico quando a evidencia de identidade conecta perfis diferentes.
- [x] Permitir vinculo manual revisado pelo Super Admin, com motivo e audit trail.
- [x] Permitir assignment manual para usuario passivo.
- [x] Bloquear a acao de activation email na UI enquanto Communication Mode nao for `LIVE`.
- [ ] Executar Dry Run de producao do diretorio completo e registrar os contadores.
- [ ] Executar Write Sync aprovado e repetir REDBOOK/Translations para fechar conflitos profissionais.

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
- [x] Professional directory (interpreters/translators, ativos e passivos).
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
- [x] Emails externos bloqueados em teste.
- [ ] Reconciliacao Airtable vs plataforma aprovada.
- [ ] Import full executado.
- [ ] Novos formularios ativados.
- [ ] Airtable intake desativado.
- [ ] Sync fica como audit/read-only ou e removido da operacao diaria.

## 16. Prova de reconciliacao financeira

### Baseline validado em 24/07/2026

Modo operacional usado na prova:

- `HYBRID`
- Importacao `ON`
- Emails `SUPPRESSED`
- Airtable somente leitura

Problema raiz encontrado:

- A tabela Airtable `Invoices` possui uma linha financeira por job.
- Varias linhas podem compartilhar o mesmo `Invoice Nbr`.
- O importador antigo gravava uma invoice por linha usando um ID derivado apenas do numero da invoice.
- Linhas posteriores sobrescreviam as anteriores, perdendo jobs e valores.
- A extracao antiga de links aceitava campos cujo nome apenas terminava com `Job Number from redbook`, contando lookups de data, agente, idioma e outros campos como links de jobs.

Implementacao concluida:

- [x] Agrupar linhas por `Invoice Nbr` normalizado.
- [x] Preservar registros sem referencia como invoices separadas e auditaveis.
- [x] Somar subtotal, VAT e total de todas as linhas.
- [x] Criar uma `ClientInvoiceLine` deterministica por job.
- [x] Distribuir o valor quando uma linha Airtable referencia mais de um job.
- [x] Remover linhas importadas antigas que nao pertencem mais ao grupo.
- [x] Persistir `sourceRecordIds`, quantidade de registros e status de origem.
- [x] Bloquear promocao indevida para `PAID` quando as linhas do grupo possuem status mistos.
- [x] Extrair links somente de campos Airtable exatos.
- [x] Fazer o audit considerar `Paid` e `paidAt` como evidencia de pagamento.
- [x] Executar Dry Run completo com zero erros.
- [x] Executar Write Sync completo com zero erros.

Provas de referencia:

- `HAM007.Sept.25` e `HAM007.sept.25` foram consolidadas em uma invoice.
- Airtable: 50 registros, total bruto `GBP 8,642.68`.
- Plataforma: 50 jobs, 50 linhas, 50 timesheets e total `GBP 8,642.68`.
- `HIC0001.7480`: `PAID`, `GBP 525.18`, 1 job, 1 linha e 1 timesheet.
- `HIC0001.7481`: `PAID`, `GBP 473.52`, 1 job, 1 linha e 1 timesheet.

Resultado do Financial Proof:

| Indicador | Antes | Depois |
| --- | ---: | ---: |
| Documentos saudaveis | 127 | 1,613 |
| Documentos afetados | 1,986 | 501 |
| Issues | 2,909 | 1,274 |
| Status divergente | 1,620 | 107 |

Backlog financeiro de alta prioridade:

- [ ] Resolver 431 bookings com sinal financeiro sem link de client invoice.
- [ ] Resolver 306 invoices sem job persistido.
- [ ] Tratar 269 invoices sem valor verificavel na origem.
- [ ] Tratar 161 invoices sem referencia externa.
- [ ] Revisar 107 divergencias reais de status.
- [ ] Separar no audit os fluxos de interpretacao, traducao e cancellation fee.
- [ ] Adicionar contadores por motivo ao resultado do Dry Run, nao apenas ao Financial Proof.

## 17. Prova de identidade profissional

### Causa raiz confirmada em 24/07/2026

- O importador anterior lia apenas linhas com `{active!} = active`.
- Jobs historicos e atuais podem apontar diretamente para profissionais `inactive`, `on leave`, `unreliable`, `only transl`, `Applicant` ou sem status.
- Exemplo confirmado: `LING26.16101 Polish` aponta para o registro profissional Airtable `recYDgdk20Pi20SmE`, que estava `inactive` e por isso nao existia no diretorio da plataforma.
- O resultado era `PROFESSIONAL_NOT_RESOLVED`, mesmo quando REDBOOK continha um link profissional valido.

### Arquitetura implementada

- O Airtable continua estritamente read-only.
- Toda pessoa com nome valido vira um perfil operacional/historico.
- O perfil preserva `sourceRecordId`, `airtableRecordIds`, `airtableStatus`, idiomas e snapshot de origem.
- Somente status elegiveis podem criar conta; os demais permanecem staff-managed.
- Uma conta existente e suspensa quando o perfil final deixa de ser elegivel.
- Evidencia ambigua nunca faz merge automatico.
- O Super Admin pode confirmar um vinculo pelo Sync Center; a decisao grava motivo, ator, timestamp e audit log.
- O conflito permanece aberto ate um novo Dry Run/Write Sync comprovar o match.
- A UI de activation email fica bloqueada em `SUPPRESSED`, `INTERNAL_ONLY` e `SELECTIVE_LIVE`.

### Prova pendente de producao

- [x] Dry Run do diretorio profissional com zero erros.
- [x] Revisar `ambiguousSourceRows` e `accountConflicts`.
- [x] Write Sync do diretorio aprovado.
- [x] Dry Run e Write Sync REDBOOK depois do diretorio.
- [x] Dry Run e Write Sync de Translations depois do diretorio.
- [x] Medir reducao de `PROFESSIONAL_NOT_RESOLVED` e `PROFESSIONAL_MATCH_AMBIGUOUS`.
- [ ] Resolver manualmente apenas os casos restantes com evidencia suficiente.
- [x] Confirmar que nenhum email foi criado ou enviado durante a prova.

### Resultado validado em producao em 24/07/2026

Modo da prova:

- `HYBRID`
- Airtable Import `ON`
- Email `SUPPRESSED`
- Airtable estritamente read-only

Diretorio profissional:

| Indicador | Resultado |
| --- | ---: |
| Linhas Airtable lidas | 408 |
| Perfis profissionais consolidados | 274 |
| Elegiveis para portal | 217 |
| Perfis passivos/staff-managed | 57 |
| Perfis sem email | 12 |
| Linhas ambiguas | 0 |
| Perfis criados | 86 |
| Perfis atualizados | 188 |
| Perfis sem conta de portal | 62 |
| Contas criadas | 24 |
| Conflitos de conta | 2 |
| Erros | 0 |

REDBOOK:

- Dry Run limpo: `0` conflitos e `0` erros.
- Write Sync persistido no historico duravel.
- Reexecucao idempotente: `0` criados, `2` atualizados, `2.204` ignorados, `0` conflitos e `0` erros.
- Nenhum conflito profissional aberto permaneceu no modulo de interpretacao.

Translations:

- Dry Run: `5` criados, `425` atualizados, `0` erros.
- Write Sync: `5` criados, `425` atualizados, `16` conflitos de cliente e `0` erros.
- `PROFESSIONAL_NOT_RESOLVED`: `50` antes, `0` depois.
- `PROFESSIONAL_MATCH_AMBIGUOUS`: `0` depois.
- Os conflitos restantes pertencem a identidade de cliente e integridade financeira; nao devem ser tratados como falha do diretorio profissional.

Pendencia profissional residual:

- [x] Nenhum vinculo profissional manual e necessario no baseline atual.
- [ ] Manter o resolvedor manual apenas para novos casos futuros com evidencia forte.

## 18. Prova final de invoices e idempotencia

### Escopo validado em producao em 24/07/2026

Modo operacional preservado durante toda a prova:

- `HYBRID`
- Airtable Import `ON`
- Email `SUPPRESSED`
- Airtable estritamente read-only

Politicas consolidadas:

- `invoiced by interp` e um estado do payable do profissional e nao comprova faturamento ao cliente.
- Esse sinal permanece `DRAFT` no client invoice ate existir evidencia real de invoice emitida.
- Falta de valor, referencia ou job link em `DRAFT` fica na fila de Finance readiness.
- Falta desses dados em `SENT` ou `PAID` gera conflito bloqueante de reconciliacao.
- `PAID` vence estados anteriores ao consolidar varias linhas do mesmo invoice.
- Um status cancelado misturado com estados financeiros ativos gera conflito e nunca e promovido silenciosamente.
- Imports financeiros nao criam clientes improvisados; exigem uma organizacao canonica do Client CRM.

Implementacao tecnica:

- [x] Mapear os nomes reais dos campos da tabela Airtable `TR invoices`.
- [x] Agrupar linhas por numero externo de invoice.
- [x] Consolidar todos os jobs, source record IDs, valores e status do grupo.
- [x] Criar linhas deterministicas por translation job.
- [x] Preservar invoices sem referencia como registros separados e auditaveis.
- [x] Usar a mesma projecao para calcular e persistir `airtableSnapshotHash`.
- [x] Tornar a idempotencia uma garantia compartilhada pelos quatro imports financeiros.
- [x] Substituir `window.confirm` por confirmacao interna acessivel no Sync Center.
- [x] Confirmar explicitamente na UI que Airtable continua read-only.
- [x] Confirmar explicitamente na UI que comunicacoes seguem o Platform Mode.

Prova de agrupamento de translation client invoices:

| Indicador | Resultado |
| --- | ---: |
| Linhas Airtable lidas | 359 |
| Invoices canonicas produzidas | 248 |
| Linhas duplicadas consolidadas | 111 |
| Conflitos reportados durante o modulo | 36 |
| Erros tecnicos | 0 |

Exemplos confirmados:

- `HAM007.JAN25`: 9 jobs agrupados.
- `HAM007.Sept`: 8 jobs agrupados.
- `HAM016.2930`: 18 jobs agrupados.
- `HAM007.August`: 10 jobs agrupados.

Write Sync final:

- Executado em `24/07/2026, 15:14:27`.
- `0` criados.
- `248` atualizados para persistir a projecao canonica e o hash correto.
- `36` eventos de conflito de dados.
- `0` erros.

Prova de idempotencia imediatamente apos o Write Sync:

- `0` criados.
- `0` atualizados.
- `248` ignorados.
- `36` conflitos conhecidos.
- `0` erros.

Reconciliacao global apos refresh:

| Motivo | Quantidade |
| --- | ---: |
| `CLIENT_ACCOUNT_REF_AMBIGUOUS` | 15 |
| `CLIENT_NOT_RESOLVED` | 1 |
| `INVOICE_AMOUNT_MISSING` | 14 |
| `INVOICE_CLIENT_NOT_RESOLVED` | 8 |
| `INVOICE_JOB_LINK_NOT_RESOLVED` | 1 |
| `INVOICE_REFERENCE_MISSING` | 6 |
| `INVOICE_WITHOUT_SOURCE_JOB_LINK` | 1 |
| `TRANSLATION_INVOICE_AMOUNT_MISSING` | 3 |
| `TRANSLATION_INVOICE_REFERENCE_MISSING` | 1 |
| **Total** | **50** |

Severidade:

- `42` HIGH.
- `8` MEDIUM.
- `0` LOW.

Esses 50 itens sao pendencias reais de evidencia ou dados-fonte. O importador nao deve escolher um cliente, inventar uma referencia ou fabricar um valor financeiro. Cada item permanece filtravel, possui evidencia revisavel e recomenda uma acao operacional.

Verificacao automatizada:

- [x] `41` arquivos de teste aprovados.
- [x] `242` testes aprovados.
- [x] TypeScript aprovado.
- [x] Build Vite de producao aprovado.
- [x] Hosting publicado.
- [x] `syncAirtableData` publicado.
- [x] `scheduledRedbookSync` publicado.

Backlog tecnico obrigatorio antes de 30/10/2026:

- [ ] Migrar Firebase Functions de Node.js 20 para um runtime suportado.
- [ ] Atualizar `firebase-functions` e executar uma regressao completa de callable, scheduler e secrets.
- [ ] Reduzir os chunks acima de 500 kB sem alterar os fluxos operacionais.
