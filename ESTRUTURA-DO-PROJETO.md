# Plano de Metas — Dicionário da Aplicação

> Documento de referência técnica para humanos e modelos de linguagem que forem trabalhar
> neste repositório. Descreve estrutura de pastas, modelo de dados, regras de negócio,
> RBAC, rotas, server actions, componentes e convenções. Gerado por leitura completa do
> código-fonte em 2026-09-23 e atualizado após a **Fase 1 de produção** (PostgreSQL,
> Auth.js com login real, middleware de proteção, rate limit no login, correções de RBAC).

---

## 1. Visão geral

**Plano de Metas** é um SaaS interno de gestão do **Plano de Metas 2025–2028 da Prefeitura
Municipal de Ubá (MG)**. Permite que secretarias municipais cadastrem metas de curto prazo
vinculadas aos capítulos do plano de governo, quebrem essas metas em ações mensuráveis,
acompanhem progresso ao longo do tempo, e movimentem alterações através de um fluxo de
aprovação hierárquico (proposta → aprovação → aplicação).

- **Cliente**: Prefeitura de Ubá/MG.
- **Desenvolvedor**: Cubic Consultoria (marca exibida no rodapé do app — logos em `02-logo-png/`).
- **Estágio**: em transição de MVP para produção (VPS Hostinger). Fase 1 concluída: PostgreSQL,
  autenticação real (Auth.js + senha bcrypt), middleware negando acesso por padrão. Dados de seed
  reais (organograma) e simulados (progresso das metas).
- **Idioma**: toda a UI, nomes de variáveis de domínio, mensagens e comentários estão em **português (pt-BR)**.

### Documentos de negócio (fora do código, na raiz do repo)
- `Fluxo de Aprovações e Permissões - Plano de Metas.pdf` — especificação do fluxo de aprovação/RBAC.
- `Organograma - Prefeitura de Ubá (2025-2028).pdf` — organograma oficial (fonte do seed).
- `pje-...PLANO DE GOVERNO -UBÁ- FINAL.pdf` — plano de governo (fonte das metas de longo/curto prazo).
- `*.xlsx` — planilhas de origem dos dados (metas agrupadas, propostas, administração). A lógica de
  cálculo de progresso (`pctFromAcoes` em `lib/format.ts`) replica fórmulas dessas planilhas.

---

## 2. Stack tecnológica

| Camada | Tecnologia | Versão | Observação |
|---|---|---|---|
| Framework | Next.js | ^15.5.26 | App Router, Server Components + Server Actions. **Não rebaixar**: versões < 15.2.3 têm bypass de middleware (CVE-2025-29927) e a linha 15.x sem patch tem RCE em RSC (CVE-2025-55182) |
| UI | React | ^19.3.0 | estável |
| Linguagem | TypeScript | ^5.6.3 | strict |
| ORM | Prisma | ^5.22.0 | `@prisma/client` |
| Banco de dados | PostgreSQL | 16 | `DATABASE_URL` em `.env`; em dev via `docker-compose.dev.yml` (porta 55432) |
| Autenticação | Auth.js (`next-auth`) | 5.0.0-beta.32 | só Credentials Provider, sessão JWT |
| Hash de senha | bcryptjs | ^3.0.3 | custo 12 |
| Validação | Zod | ^3.23.8 | valida inputs de Server Action (cobertura ainda não é 100% — ver seção 16) |
| Estilo | Tailwind CSS | ^3.4.15 | + CSS puro com variáveis de tema em `globals.css` |
| Fontes | Fraunces (display/serif), IBM Plex Sans (corpo), IBM Plex Mono (dados/labels) | via Google Fonts |
| Runtime scripts | tsx | ^4.19.2 | roda `prisma/seed.ts`, `prisma/definir-senha.ts` e `prisma/test-metas.ts` |

Não há: testes automatizados, CI/CD, nem API externa. É uma aplicação monolítica Next.js com
todo o estado no PostgreSQL.

---

## 3. Estrutura de diretórios

```
D:\plataforma metas\                          ← pasta raiz (NÃO é repositório git)
├── *.pdf, *.xlsx                              ← documentos de negócio / dados-fonte
└── Plano de Metas\
    ├── 02-logo-png\                           ← identidade visual (Cubic Consultoria), várias cores/tamanhos
    ├── *.xlsx                                 ← planilhas de origem (metas, propostas, administração)
    ├── Iniciar Plano de Metas.bat              ← ★ duplo clique = sobe tudo: Docker → Postgres → .env/npm install
    │                                              (se faltarem) → trava de migrações (verificar-migracoes.ts) →
    │                                              migrate deploy → seed se o banco estiver vazio
    │                                              (pausa p/ anotar senhas) → next dev em 127.0.0.1:3000 → abre o
    │                                              navegador. Se já estiver no ar, só abre o navegador.
    │                                              Salvo em CP850 + CRLF em TODAS as linhas (exigência do cmd.exe; não
    │                                              salvar como UTF-8 nem com quebras LF). Depois de editar, conferir os
    │                                              rótulos de goto (divisa de 512 bytes — ver Enviar para o GitHub.bat)
    ├── Enviar para o GitHub.bat                ← duplo clique = commit + push de app/ para github.com/Dalbertvg/plat.
    │                                              Sem senha no arquivo (login pelo Git Credential Manager no navegador);
    │                                              avisa se o repositório estiver público; bloqueia se o .env não estiver
    │                                              no .gitignore; autor = e-mail noreply do GitHub. Escrito SEM goto:
    │                                              o cmd.exe não acha rótulos que caem na divisa de blocos de 512 bytes
    │                                              (ao editar qualquer .bat daqui, prefira fluxo linear com blocos if)
    ├── .claude\launch.json                     ← config do Claude Code Browser: sobe o dev server (porta 3000)
    └── app\                                    ← ★ código-fonte da aplicação (raiz do projeto Next.js)
        ├── .env                                ← DATABASE_URL (Postgres) + AUTH_SECRET (fora do versionamento)
        ├── .env.example                        ← ★ documentação de todas as variáveis de ambiente
        ├── docker-compose.dev.yml              ← Postgres 16 só para desenvolvimento (127.0.0.1:55432)
        ├── render.yaml                         ← ★ Blueprint do Render: Postgres + web service (seção 17)
        ├── package.json                        ← scripts e dependências (ver seção 13)
        ├── next.config.mjs, tsconfig.json, tailwind.config.ts, postcss.config.mjs
        ├── prisma\
        │   ├── schema.prisma                   ← ★ modelo de dados completo (seção 4)
        │   ├── seed.ts                          ← organograma real + metas/ações demo + senhas iniciais. Só age em banco
        │   │                                        TOTALMENTE vazio (qualquer linha em qualquer tabela = não faz nada) e
        │   │                                        nunca apaga nem altera dados (seção 18)
        │   ├── definir-senha.ts                  ← CLI do admin: redefine a senha de um usuário e derruba as sessões dele
        │   ├── verificar-ambiente.ts             ← 1º passo do `npm run start`: loga `[config] ...` (quais variáveis existem, sem
        │   │                                        valores) e aborta o start se faltar DATABASE_URL, AUTH_SECRET (≥32) ou config de host
        │   ├── verificar-migracoes.ts            ← ★ TRAVA DOS DADOS: antes de `migrate deploy`, cancela o start se alguma
        │   │                                        migração pendente apagar/alterar dados (DROP, DELETE, UPDATE…) — seção 18
        │   ├── somente-local.ts                  ← recusa db:reset / db:setup / test-metas:* fora do banco desta máquina
        │   ├── test-metas.ts                    ← script auxiliar: add/remove metas de teste (só banco local)
        │   ├── migrations\                      ← migrations PostgreSQL (baseline: *_init_postgresql; *_indices_desempenho)
        │   ├── migracoes-sqlite-legado\          ← migrations antigas do SQLite, só para referência histórica
        │   └── dev.db                           ← banco SQLite antigo — NÃO é mais usado; dados ainda não migrados
        └── src\
            ├── auth.config.ts                   ← ★ config do Auth.js compatível com Edge (usada pelo middleware)
            ├── auth.ts                          ← ★ Auth.js completo: Credentials + bcrypt + rate limit (Node)
            ├── middleware.ts                    ← ★ nega acesso sem sessão a tudo, exceto /login e /api/auth/*
            ├── types\next-auth.d.ts              ← tipagem de sessão/JWT (id, sessaoVersao)
            ├── actions\                          ← ★ Server Actions — toda escrita no banco passa por aqui
            │   ├── auth.ts                       ← entrar (login com rate limit) / sair (logout)
            │   ├── metas.ts                      ← CRUD de MetaCP e Acao (via prefeito/secretário/chefe)
            │   ├── acoes.ts                       ← updateAcao — atualizar progresso de uma ação
            │   ├── propostas.ts                   ← fluxo de propostas: submeter/aprovar/rejeitar/aplicar
            │   ├── cobrancas.ts                    ← cobrar ação atrasada, responder cobrança, comentar
            │   ├── usuarios.ts                     ← criarUsuario (cadastro + lotação + senha inicial gerada)
            │   ├── painel.ts                       ← listarAcoesAtrasadas: lista completa de atrasos, sob demanda
            │   └── preferencias.ts                 ← salvarTema: grava o tema de cores do próprio usuário
            ├── app\                              ← ★ rotas (Next.js App Router)
            │   ├── layout.tsx                     ← RootLayout: <html>, fontes (next/font → var(--font-display|sans|mono)),
            │   │                                     data-theme do usuário logado (ou o padrão) já no HTML (seção 21)
            │   ├── page.tsx                       ← "/" → redirect para /painel
            │   ├── globals.css                    ← ★ design tokens (CSS vars), classes utilitárias (.btn, .pill, .tbl…)
            │   ├── login\page.tsx + LoginForm.tsx  ← única tela pública (sem cadastro nem recuperação de senha)
            │   ├── api\auth\[...nextauth]\route.ts ← handlers do Auth.js (csrf, callback, session, signout)
            │   └── (app)\                          ← route group PRIVADO, todas as telas internas
            │       ├── layout.tsx                  ← envolve tudo em <AppShell>
            │       ├── loading.tsx                 ← esqueleto reserva; cada tela tem o seu loading.tsx (seção 19)
            │       ├── painel\                      ← dashboard (home pós-login)
            │       │   ├── page.tsx                  ← dados via lib/painel.ts
            │       │   ├── AcoesAtrasadas.tsx        ← client: recebe total + cobranças recebidas; a lista completa
            │       │   │                                vem de actions/painel.ts ao abrir o quadro
            │       │   ├── ProximosPrazos.tsx
            │       │   └── RankingSecretarias.tsx
            │       ├── metas\
            │       │   ├── page.tsx                  ← lista/filtro de metas
            │       │   ├── nova\page.tsx + NovaMetaForm.tsx
            │       │   └── [id]\
            │       │       ├── page.tsx               ← detalhe da meta + tabela de ações
            │       │       └── editar\
            │       │           ├── page.tsx            ← editar meta + CRUD de ações inline
            │       │           ├── UnidadeInput.tsx      ← client: select de unidade + "outro" custom
            │       │           └── MesAnoPicker.tsx      ← client: dois <select> (mês/ano) → "YYYY-MM"
            │       ├── propostas\
            │       │   ├── page.tsx                  ← caixa de entrada (pendentes/minhas/outras)
            │       │   ├── nova\page.tsx + NovaPropostaForm.tsx
            │       │   └── [id]\page.tsx              ← timeline + conversa (comentários) da proposta
            │       ├── usuarios\
            │       │   ├── page.tsx                  ← lista de usuários (só prefeito/secretário)
            │       │   └── novo\page.tsx + NovoUsuarioForm.tsx
            │       ├── auditoria\page.tsx             ← feed de auditoria com RBAC de leitura
            │       └── organograma\page.tsx           ← árvore secretaria → divisão → pessoas
            ├── components\                        ← componentes compartilhados entre rotas
            │   ├── AppShell.tsx                     ← ★ layout raiz autenticado: topbar (usuário + Sair) + sidebar + main;
            │   │                                       responsivo (seção 20): sidebar fixa só a partir de 1024 px
            │   ├── MenuMovel.tsx                      ← client: botão ☰ + gaveta com o menu em telas < 1024 px
            │   ├── SidebarNav.tsx                     ← menu lateral (client, usa usePathname)
            │   ├── SeletorTema.tsx                    ← área "Aparência" do menu: tema de cores salvo no usuário (seção 21)
            │   ├── Esqueleto.tsx                      ← peças dos esqueletos de carregamento (loading.tsx)
            │   └── BotaoEnviar.tsx                    ← botão de submit que vira "Salvando…" (useFormStatus)
            └── lib\                                ← ★ lógica pura / infraestrutura, sem JSX
                ├── db.ts                             ← singleton do PrismaClient (pool: 5 conexões, DB_CONEXOES)
                ├── painel.ts                         ← ★ dados do painel: base filtrada no banco, situação passada em
                │                                        cache de 10 min, classificação e detalhe das ações em atraso
                ├── session.ts                         ← ★ getCurrentUser() / requireUser() — sessão Auth.js validada no banco
                ├── senha.ts                           ← hash/verificação bcrypt, geração de senha inicial
                ├── rate-limit.ts                      ← rate limit de janela fixa persistido no Postgres + IP do cliente
                ├── rbac.ts                            ← ★ toda a lógica de permissões (seção 5)
                └── format.ts                          ← ★ formatação + cálculo de progresso/prazo/status (seção 10)
```

---

## 4. Modelo de dados (`prisma/schema.prisma`)

Banco PostgreSQL, client gerado via `prisma-client-js`. IDs são majoritariamente **strings legíveis
geradas manualmente** nas Server Actions (não UUIDs do Prisma), com padrão `PREFIXO-` +
`Date.now().toString(36).toUpperCase()` (ex.: `MCP-LX3F9A2`, `ACAO-LX3FA01`, `PROP-LX3FA33`).
Exceções: `Lotacao`, `AcaoSnapshot`, `Comentario`, `Auditoria` usam `@default(cuid())`.

### 4.1 Organização

**`Secretaria`** — uma secretaria municipal (ou o Gabinete do Prefeito).
| campo | tipo | descrição |
|---|---|---|
| `id` | String (PK) | ex.: `sec_seg`, `sec_sau`, `sec_gab` |
| `nome` | String | nome oficial |
| `titular` | String? | nome da pessoa titular (informativo, não é FK de `Usuario`) |
| `tipo` | String | `"secretaria"` (default) ou `"gabinete"` |

Relações: `divisoes[]`, `lotacoes[]`, `metasLP[]`, `metasCPDona[]` (dona), `metasCPParticipa[]`
(participante em metas conjuntas), `propostas[]`.

**`Divisao`** — subunidade de uma secretaria (ex.: "Guarda Civil Municipal").
| campo | tipo | descrição |
|---|---|---|
| `id` | String (PK) | ex.: `div_seg_gcm` |
| `nome` | String | |
| `secretariaId` | String (FK → Secretaria) | |
| `chefeId` | String? | **não é FK real** (campo solto, não referencia `Usuario.id` via relação Prisma) |

### 4.2 Usuários e lotações

**`Usuario`** — pessoa do sistema.
| campo | tipo | descrição |
|---|---|---|
| `id` | String (PK) | ex.: `u_damato` |
| `nome` | String | |
| `email` | String (unique) | login; **sempre gravado em minúsculas** |
| `perfil` | String | `"prefeito"` \| `"secretario"` \| `"chefe"` — ver `Perfil` em `rbac.ts` |
| `ativo` | Boolean (default true) | `false` bloqueia login e derruba sessões já abertas (checado em `getCurrentUser`); ainda não há UI para desativar |
| `ultimoAcesso` | DateTime? | atualizado a cada login bem-sucedido (`authorize` em `src/auth.ts`) |
| `senhaHash` | String | hash bcrypt (custo 12). Obrigatório: não existe conta sem senha |
| `sessaoVersao` | Int (default 0) | viaja no JWT; incrementar invalida todas as sessões do usuário (usado por `definir-senha.ts`) |
| `tema` | String? | tema de cores escolhido em "Aparência" (`azul`, `turquesa`, `classico`, `petroleo`, `marrom`); `null` = padrão (`azul`). Ver seção 21 |

**`Lotacao`** — vínculo N:N entre `Usuario` e (`Secretaria`, `Divisao`?). Um usuário pode ter
**múltiplas lotações** (ex.: chefe emprestado a duas divisões). Chave única
`[usuarioId, secretariaId, divisaoId]` evita duplicata exata.
| campo | tipo | descrição |
|---|---|---|
| `id` | String (cuid) | |
| `usuarioId` | String (FK, `onDelete: Cascade`) | |
| `secretariaId` | String (FK) | |
| `divisaoId` | String? (FK) | `null` = lotação só na secretaria (típico de secretário/prefeito) |

> **Regra de união (multi-lotação)**: quando um usuário tem várias lotações, prevalece o
> **maior nível de acesso concedido por qualquer uma delas** — ver `rbac.ts`.

### 4.3 Metas e ações

**`MetaLP`** — meta de **longo prazo** (mapeia um capítulo do plano de governo).
| campo | descrição |
|---|---|
| `id` | ex.: `lp_seg`, `lp_mob` |
| `capitulo` | ex.: `"04/16"`, `"12"` — número do capítulo no PDF do plano de governo |
| `titulo` | título do capítulo |
| `secretariaDonaId` | secretaria responsável pelo capítulo |

**`MetaCP`** — meta de **curto prazo**, a unidade de trabalho principal do sistema.
| campo | tipo | descrição |
|---|---|---|
| `id` | String (PK) | ex.: `META013`, ou `MCP-...` quando criada pela UI |
| `nome` | String | |
| `tipo` | String | `"principal"` (compromisso do plano de governo — só o **prefeito** pode marcar) \| `"secundaria"` (default; qualquer meta criada por outro perfil, ou nascida de proposta) |
| `metaLPId` | FK → MetaLP | capítulo ao qual pertence |
| `secretariaDonaId` | FK → Secretaria | dona da meta |
| `divisaoExecutoraId` | FK → Divisao | **deve pertencer à secretaria dona** (validado nas actions) |
| `criadoEm` | DateTime | |
| `arquivada` | Boolean (default false) | ver "soft delete" abaixo |
| `arquivadaEm`, `arquivadaPor`, `arquivadaJustificativa` | DateTime?/String? | preenchidos ao arquivar |

> **"Excluir" nunca é hard delete.** `arquivarMetaCP` (só prefeito) marca `arquivada=true` com
> justificativa obrigatória (mín. 10 caracteres). Preserva ações, propostas e auditoria.
> Metas arquivadas: saem da listagem padrão, não podem ser editadas, não aceitam novas ações/propostas.

Relações: `participantes: MetaCPParticipante[]`, `acoes: Acao[]`.

**`MetaCPParticipante`** — join table: outras secretarias que participam de uma meta conjunta
(além da dona). Chave composta `[metaCPId, secretariaId]`. Usada por `filterVisibleMetas` para
dar visibilidade extra a secretarias participantes.

**`Acao`** — unidade mensurável dentro de uma `MetaCP`.
| campo | tipo | descrição |
|---|---|---|
| `id` | String (PK) | ex.: `ACAO-...` |
| `metaCPId` | FK (`onDelete: Cascade`) | |
| `nome` | String | |
| `peso` | Int | **derivado automaticamente** de `tempoNecessario` via `pesoDeTempo()` — não é editável direto |
| `tempoNecessario` | String? | enum: `"ate_6m"` \| `"7_12m"` \| `"13_24m"` \| `"25_36m"` \| `"acima_36m"` |
| `alvo` | Float | valor-alvo (ex.: 100, 30, 5000) |
| `unidade` | String? | `"%"` \| `"un"` \| `"R$"` \| `"h"` \| `"dias"` \| `"meses"` \| `"pessoas"` \| `"km"` \| texto livre |
| `situacaoAtual` | Float | **normalizada em 0–1** (não 0–100!) — o form usa % mas a action divide por 100 antes de salvar |
| `status` | String | `"andamento"` \| `"atraso"` \| `"concluida"` — **campo hoje é só informativo**; o status exibido na UI é sempre recalculado em tempo real por `computeStatusAcao()` |
| `inicio` | String? | formato `"YYYY-MM"` |
| `prazo` | String? | campo legado — o prazo real usado no sistema é **calculado** (`calcPrazoFinal`), não lido daqui |
| `responsavelId` | String? (FK → Usuario) | |
| `ultJustificativa`, `ultJustQuando` | String?/DateTime? | última justificativa de mudança de situação |

Relações: `snapshots: AcaoSnapshot[]`, `anexos: Anexo[]`.

**`Anexo`** — arquivo de evidência da execução de uma ação (PDF, foto). **Modelo já existe no
banco; o serviço de upload/download (`src/lib/storage.ts`) ainda não foi implementado.**
| campo | descrição |
|---|---|
| `id` | cuid |
| `acaoId` | FK → Acao, **`onDelete: Restrict`** — uma ação com anexos não pode ser apagada sem tratar os arquivos antes |
| `nomeOriginal` | nome enviado pelo usuário; só para exibição, **nunca usado como caminho** |
| `mimeType` | detectado pelos bytes do arquivo, não pela extensão |
| `tamanhoBytes`, `sha256` | tamanho e hash de integridade |
| `storageDriver` | `"local"` (disco da VPS, fora de `public/`) \| `"s3"` (MinIO/R2) |
| `storageKey` | chave opaca gerada pelo servidor (unique). **Não se guarda URL pública**: o download passa por rota autenticada que checa o RBAC da ação |
| `enviadoPorId` | FK → Usuario |
| `criadoEm` | timestamp |

**`AcaoSnapshot`** — histórico de progresso. Um registro é criado a cada vez que
`situacaoAtual` muda (em `updateAcao`) e um baseline (0) na criação da ação (`criarAcao`).
Usado para calcular deltas de progresso ("há 30 dias", "há 90 dias" etc. no painel).
| campo | descrição |
|---|---|
| `acaoId` | FK (`onDelete: Cascade`) |
| `situacaoAtual` | valor no momento do snapshot (0–1) |
| `peso` | peso vigente no momento (pode mudar se o `tempoNecessario` for editado depois) |
| `quando` | timestamp |

### 4.4 Propostas (fluxo de aprovação)

**`Proposta`** — pedido de mudança que precisa subir a cadeia hierárquica antes de virar
mudança real. Três tipos, cada um com um **payload JSON estruturado** próprio:

| campo | descrição |
|---|---|
| `id` | ex.: `PROP-...` |
| `titulo`, `descricao` | descrição livre (descrição = justificativa, obrigatória) |
| `tipo` | `"nova"` (nova MetaCP) \| `"edicao"` (editar MetaCP existente) \| `"ajuste_acao"` (editar Acao existente) |
| `autorId` | FK → Usuario (quem propôs) |
| `secretariaDonaId` | secretaria alvo da mudança |
| `divisaoOrigemId` | divisão do autor (se chefe) — usada para roteamento e RBAC |
| `metaCPRefId` | meta alvo (obrigatório se `tipo` for `edicao`/`ajuste_acao`) |
| `proximoRevisor` | `"chefe"` \| `"secretario"` \| `"prefeito"` — quem precisa agir agora |
| `status` | `"pendente"` (default) \| `"aprovada"` \| `"rejeitada"` |
| `criadoEm`, `aprovadaEm`, `aprovadaPor`, `rejeitadaEm`, `rejeitadaPor` | auditoria de datas/atores |
| `payloadJson` | String? — JSON do "patch" estruturado (schemas Zod em `actions/propostas.ts`, ver 4.4.1) |
| `aplicadaEm` | DateTime? — quando o patch foi de fato aplicado à Meta/Ação (após aprovação final) |
| `aplicacaoErro` | String? — se a aplicação falhou, o erro fica aqui (a aprovação **não é revertida**) |

Relação: `comentarios: Comentario[]` — a "conversa" livre da proposta, fora do
fluxo de aprovar/rejeitar (ver `responderProposta`).

**`Comentario`** — mensagem livre em uma proposta. `propostaId`, `autorId`, `texto`, `quando`.

#### 4.4.1 Formato de `payloadJson` por tipo

```ts
// tipo = "ajuste_acao"
{ acaoId: string; nome?: string; tempoNecessario?: TempoEnum; alvo?: number;
  unidade?: string; responsavelId?: string | null; inicio?: "YYYY-MM" }

// tipo = "edicao"  (edita a MetaCP referenciada em metaCPRefId)
{ nome?: string; divisaoExecutoraId?: string }

// tipo = "nova"  (cria uma MetaCP nova, sempre tipo "secundaria")
{ nome: string; metaLPId: string; divisaoExecutoraId: string; participantes?: string[] }
```

### 4.5 Auditoria

**`Auditoria`** — log de eventos, **fonte única de verdade para histórico** de todo o sistema.
Também é usada como mecanismo de "cobrança" e "comentário" (não têm tabela própria — ver seção 15).
| campo | descrição |
|---|---|
| `id` | cuid |
| `quando` | timestamp |
| `atorId`, `atorNome`, `perfil` | quem fez (nome/perfil **denormalizados** no momento do evento, não via join) |
| `msg` | mensagem humana, ex.: `criou meta "X"`, `cobrou Fulano sobre "Y"` |
| `tag` | string curta e estável usada para filtrar/agrupar — ver tabela de tags abaixo |
| `entidade` | `"metaCP"` \| `"meta"` \| `"acao"` \| `"proposta"` \| `"usuario"` |
| `entidadeId` | id da entidade afetada |
| `lotacaoUsada` | String? — não populado em nenhuma action lida (campo reservado) |
| `parentId` | FK auto-relacional → outra `Auditoria` — usado para threads (ex.: resposta a uma cobrança) |

#### Tags de auditoria em uso

| tag | quando é criada |
|---|---|
| `META:CRIADA` / `META:ATUALIZADA` / `META:ARQUIVADA` | `actions/metas.ts` |
| `ACAO:CRIADA` / `ACAO:EDITADA` / `ACAO:DELETADA` | `actions/metas.ts` |
| `ACAO:UPDATE` | `actions/acoes.ts` — atualização de progresso |
| `ACAO:COBRANCA` / `ACAO:RESPOSTA_COBRANCA` / `ACAO:COMENTARIO` | `actions/cobrancas.ts` |
| `PROPOSTA:CRIADA` / `PROPOSTA:ENCAMINHADA` / `PROPOSTA:APROVADA` / `PROPOSTA:REJEITADA` / `PROPOSTA:COMENTARIO` | `actions/propostas.ts` |
| `META:CRIADA_VIA_PROPOSTA` / `META:APLICADA_VIA_PROPOSTA` / `ACAO:APLICADA_VIA_PROPOSTA` | `actions/propostas.ts` → `applyProposta` |
| `USUARIO:CRIADO` | `actions/usuarios.ts` |

### 4.6 Rate limit

**`RateLimit`**: `chave` (PK, ex.: `login:ip:203.0.113.5`, `login:email:fulano@…`), `contagem`,
`expiraEm` (indexado). Tabela operacional, não é dado de negócio: linhas expiradas são apagadas
por amostragem (~2% das chamadas). Ver seção 6.5.

---

## 5. RBAC (`src/lib/rbac.ts`)

> Comentário no topo do arquivo: *"RBAC — Rev. 3.0. Fluxo hierárquico obrigatório: Chefe →
> Secretário → Publicado. Múltiplas lotações resolvem pela regra da UNIÃO."*

### 5.1 Perfis

```ts
type Perfil = 'prefeito' | 'secretario' | 'chefe';
```
Não existe mais o perfil "funcionário" (removido; ver comentário em `seed.ts` — ex-funcionários
foram migrados para `chefe` nas mesmas lotações). Hierarquia de execução tem **um único nível**
abaixo do secretário.

### 5.2 Tipos-chave

```ts
type Lotacao = { secretariaId: string; divisaoId: string | null };
type UserContext = { id: string; perfil: Perfil; lotacoes: Lotacao[] };
type MetaTarget = { secretariaDonaId?: string; divisaoExecutoraId?: string };
type AcaoTarget = MetaTarget & { responsavelId?: string | null };
type PropostaTarget = { divisaoOrigemId?: string | null; secretariaDonaId?: string };
```

### 5.3 Funções de escopo (leitura/escrita)

| função | regra |
|---|---|
| `readableSecretariasOf(u, allSecIds)` | prefeito vê todas; outros veem só as das próprias lotações |
| `filterVisibleMetas(u, metas, participantes)` | prefeito vê tudo; outros veem metas da própria secretaria **+ metas onde a secretaria é participante** (meta conjunta) |
| `writableSecretariasOf(u, allSecIds)` | mesma lógica de `readableSecretariasOf` (hoje idêntica) |
| `writableDivisoesOf(u)` | união de todas as `divisaoId` das lotações do usuário |

### 5.4 Matriz de ações — `can(u, action, target)`

| `Action` | prefeito | secretário (dono) | chefe (da divisão executora) | outro |
|---|---|---|---|---|
| `user.manageGlobal` | ✅ | ❌ | ❌ | ❌ |
| `user.manageSecretaria` | ✅ | ✅ se dono da secretaria | ❌ | ❌ |
| `meta.create` | ✅ | ✅ se dono | ❌ | ❌ |
| `meta.edit` / `meta.delete` | ✅ | ✅ se dono | ❌ | ❌ |
| `meta.reassign` | ✅ | ❌ | ❌ | ❌ |
| `acao.edit` | ✅ | ✅ se dono da meta | ✅ se dono da divisão executora | ❌ |
| `acao.updateSituacao` | ✅ | ✅ se dono | ✅ se dono da divisão | **✅ fallback: se `responsavelId === u.id`** (mesmo fora da lotação — "responsável emprestado") |
| `proposta.submit` | ❌ (prefeito não propõe) | ✅ | ✅ | — |
| `proposta.approveAsChefe` | — | — | ✅ se `divisaoOrigemId` é sua lotação | — |
| `proposta.approveAsSecretario` | — | ✅ se `secretariaDonaId` é sua lotação | — | — |
| `proposta.approveAsPrefeito` | ✅ | ❌ | ❌ | — |

`requireCan(u, action, target)` — mesma checagem, mas lança `RBACError` (subclasse de `Error`)
se negado. Usada nas Server Actions para abortar com mensagem clara.

### 5.5 `podeComentarProposta(user, p)`

Quem pode participar da "conversa" de uma proposta (independente de ser o revisor atual):
prefeito, o autor, o secretário dono da `secretariaDonaId`, o chefe da `divisaoOrigemId`.
Propositalmente mais permissivo que "quem pode aprovar agora" — qualquer um que já viu a
proposta na fila pode continuar comentando depois que ela avançou.

### 5.6 `proximoRevisorDe(autor, secretariaDonaId)` — motor de roteamento

```
chefe        → sempre "secretario"
secretario   → "prefeito" SE ele é dono da secretaria alvo
             → "secretario" (fica com o dono) SE está propondo para OUTRA secretaria (não pula etapa)
prefeito     → "prefeito" (não deveria submeter; robustez apenas)
```

Isso é reaplicado em `aprovarProposta` (ver 7.3) para decidir se uma aprovação de secretário
finaliza a proposta ou a encaminha ainda ao prefeito.

---

## 6. Sessão / Autenticação

Auth.js v5 (`next-auth@5.0.0-beta.32`), **somente Credentials Provider** (e-mail + senha),
sessão **JWT** (cookie httpOnly cifrado; sem tabela de sessões). Não existe cadastro público
nem recuperação de senha self-service: contas são criadas pelo administrador.

### 6.1 Arquivos e responsabilidades

| arquivo | runtime | papel |
|---|---|---|
| `src/auth.config.ts` | Edge | config comum: `pages.signIn='/login'`, `session.maxAge` = 8h (renovado a cada uso), callbacks `jwt`/`session` que copiam `id` e `sessaoVersao` para o token/sessão. **Não pode importar Prisma nem bcrypt** |
| `src/auth.ts` | Node | `NextAuth({...authConfig, providers: [Credentials]})` → exporta `handlers`, `auth`, `signIn`, `signOut`. O `authorize` valida com Zod, aplica rate limit, busca o usuário, compara bcrypt e atualiza `ultimoAcesso`. Exporta `LimiteDeTentativas` (erro com `code='limite_tentativas'`) |
| `src/middleware.ts` | Edge | primeira barreira (seção 6.2) |
| `src/lib/session.ts` | Node | `getCurrentUser()` / `requireUser()` (seção 6.3) |
| `src/actions/auth.ts` | Node | `entrar` (form de login via `useActionState`) e `sair` |
| `src/app/api/auth/[...nextauth]/route.ts` | Node | endpoints do Auth.js |
| `src/types/next-auth.d.ts` | — | augmentação de `User`, `Session` e `JWT` (o módulo certo no beta.32 é `@auth/core/jwt`) |

### 6.2 Middleware — negar por padrão

- Rotas públicas: **apenas** `/login` e `/api/auth/*`. Assets estáticos (`/_next/static`,
  `/_next/image`, `/favicon.ico`, `/logo/*`) ficam fora do `matcher`.
- Sem sessão: páginas → `307` para `/login?callbackUrl=<rota original>`; `/api/*` → `401` JSON.
- Valida só o JWT (Edge, sem banco). **Nunca é a única proteção**: toda página e Server Action
  revalida via `getCurrentUser()`.

### 6.3 `getCurrentUser()` — identidade validada no banco

Envolvida em `React.cache` (1 consulta por requisição). Retorna `UsuarioSessao` =
`UserContext & { nome, email }` ou `null`. Devolve `null` se: não há sessão; usuário não existe;
`ativo=false`; `sessaoVersao` do banco ≠ a do JWT (sessão revogada); perfil inválido.
**Perfil e lotações vêm sempre do banco, nunca do token**, então mudanças de permissão valem
na requisição seguinte. `requireUser()` faz o mesmo e redireciona para `/login` quando `null`
(usado no `AppShell`).

A página `/login` também usa `getCurrentUser()` (e não só o JWT) para decidir se manda o
usuário ao `/painel`. Isso evita loop de redirect quando o JWT é válido mas a sessão foi revogada.

### 6.4 Senhas (`src/lib/senha.ts`)

- bcrypt custo 12 (`bcryptjs`, JS puro: sem binário nativo, funciona igual no Windows e na VPS).
- `gerarSenhaInicial()`: 16 caracteres de `node:crypto.randomInt` num alfabeto sem ambíguos (~93 bits).
- `simularVerificacao()`: quando o e-mail não existe/está inativo, gasta o mesmo tempo de um bcrypt
  real, para não revelar pelo tempo de resposta quais e-mails têm conta.
- Mensagem de erro de login é **sempre a mesma** ("E-mail ou senha inválidos.").
- `SENHA_MAX_BYTES = 72` (limite do bcrypt), para validar futuras trocas de senha.
- Sem `import 'server-only'` de propósito: os scripts `prisma/*.ts` reutilizam o módulo.

### 6.5 Rate limit (`src/lib/rate-limit.ts`)

Janela fixa persistida na tabela `RateLimit` (funciona com PM2 em cluster e sobrevive a
restart). `consumirLimite(chave, {max, janelaMs})` conta **antes** de processar (upsert atômico
= `INSERT … ON CONFLICT`). Limites de login (`LIMITES`): **20 tentativas / 15 min por IP** e
**5 / 15 min por e-mail**; o contador do e-mail zera no login bem-sucedido. O rate limit roda
**dentro do `authorize`**, então também cobre `POST /api/auth/callback/credentials` chamado direto.
`ipDoCliente()` depende do proxy à frente do app, via `IP_CLIENTE_XFF`: vazio (VPS + Nginx) →
`X-Real-IP` e, sem ele, o **último** item do `X-Forwarded-For`; `primeiro` (Render) → o
**primeiro** item, porque o edge do Render grava ali o IP real e anexa os IPs dos proxies depois.
Se `IP_CLIENTE_XFF` não for definida e `RENDER=true` (variável que o Render sempre define), o
modo `primeiro` é usado automaticamente. Configurar errado faz todos os usuários dividirem um
único limite de login.

---

## 7. Server Actions

Todos os arquivos em `src/actions/` começam com `'use server'`. Padrão comum a quase todas as
funções: `getCurrentUser()` → validar com `can`/`requireCan` → validar input com **Zod** →
mutação Prisma → `prisma.auditoria.create(...)` → `revalidatePath(...)` → (às vezes) `redirect(...)`.

### 7.1 `actions/metas.ts`

| função | input (FormData) | regra RBAC | efeito |
|---|---|---|---|
| `criarMetaCP` | nome, metaLPId, secretariaDonaId, divisaoExecutoraId, tipo?, participantes[] | `meta.create` | cria `MetaCP` (+ `MetaCPParticipante[]`); só prefeito pode setar `tipo="principal"`; valida que a divisão pertence à secretaria; redireciona para `/metas/[id]` |
| `atualizarMetaCP` | metaCPId, nome, divisaoExecutoraId, tipo?, participantes[] | `meta.edit`; bloqueado se `arquivada` | transação: atualiza `MetaCP` + substitui `MetaCPParticipante[]`; redireciona de volta para a tela de edição |
| `arquivarMetaCP` | metaCPId, justificativa (mín. 10 chars) | **só `prefeito`** (checagem direta, não via `can`) | soft-delete: seta `arquivada=true` + metadados; redireciona para `/metas` |
| `criarAcao` | metaCPId, nome, tempoNecessario, alvo, unidade?, inicio?, prazo?, responsavelId? | `acao.edit` no target da meta; bloqueado se meta arquivada | cria `Acao` (peso derivado de `pesoDeTempo`) + snapshot inicial (0) |
| `atualizarAcaoDados` | acaoId, nome, tempoNecessario, alvo, unidade?, inicio?, prazo?, responsavelId? | `acao.edit`; bloqueado se meta arquivada | atualiza dados estruturais da ação (não é progresso — isso é `updateAcao`) |
| `deletarAcao` | acaoId | `acao.edit`; bloqueado se meta arquivada | **hard delete** de `Acao` (diferente de meta, aqui é exclusão real) |

### 7.2 `actions/acoes.ts` — `updateAcao`

Atualiza o **progresso** de uma ação (campo `situacaoAtual`). Input: `acaoId`,
`situacaoAtual` (0–100, convertido para 0–1), `justificativa` (obrigatória, mín. 3 chars).
Permissão: `acao.edit` **OU** `acao.updateSituacao` (mais permissiva — inclui o responsável direto).
Recalcula `status` via `computeStatusAcao()`. Cria `AcaoSnapshot` só se o valor mudou (idempotência
de histórico). Grava auditoria `ACAO:UPDATE`.

### 7.3 `actions/propostas.ts`

| função | descrição |
|---|---|
| `submeterProposta` | valida schema por `tipo`, valida escopo (chefe só propõe para a própria secretaria/divisão), **exige que a meta alvo (`metaCPRefId`) exista, não esteja arquivada e pertença à `secretariaDonaId` declarada** (senão A poderia rotear para o próprio secretário uma edição de meta de B), calcula `proximoRevisor` via `proximoRevisorDe`, cria `Proposta` com `status="pendente"` |
| `aprovarProposta` | **só aceita proposta `pendente`** (impede "ressuscitar" rejeitada). Lógica central do fluxo: verifica se `user.perfil` bate com `p.proximoRevisor`; se **chefe aprova** → vira `"secretario"`; se **secretário aprova** → verifica se o autor era secretário de *outra* pasta (nesse caso ainda precisa ir ao `"prefeito"`), senão finaliza como `"aprovada"`; se **prefeito aprova** → finaliza. Ao finalizar, chama `applyProposta` |
| `rejeitarProposta` | **só o revisor atual** (`podeDecidirAgora`, mesma regra do aprovar) e só proposta `pendente`; exige `motivo`; seta `status="rejeitada"`; grava o motivo como `Comentario` também |
| `responderProposta` | comentário livre na "conversa" (`podeComentarProposta`), independente do fluxo aprovar/rejeitar |
| `applyProposta` (privada) | roda **após aprovação final**; idempotente (`aplicadaEm` guard); parseia `payloadJson` e despacha para `aplicarAjusteAcao` / `aplicarEdicaoMeta` / `aplicarNovaMeta`; **erros não revertem a aprovação** — ficam em `Proposta.aplicacaoErro` para intervenção manual |
| `aplicarAjusteAcao` / `aplicarEdicaoMeta` / `aplicarNovaMeta` (privadas) | aplicam o patch estruturado; recalculam `peso` se `tempoNecessario` mudou; **reconferem que a meta/ação alvo e a divisão executora pertencem à secretaria da proposta**; lançam erro se não houver mudança efetiva ou se a meta/ação alvo foi arquivada/removida entre a proposta e a aprovação |

### 7.4 `actions/cobrancas.ts` — sistema de "nudge" sem tabela própria

Cobranças, respostas e comentários de ação **não têm modelo Prisma dedicado** — são todos
gravados como `Auditoria` com tags específicas (`ACAO:COBRANCA`, `ACAO:RESPOSTA_COBRANCA`,
`ACAO:COMENTARIO`), usando `parentId` para linkar resposta ↔ cobrança original. Decisão de
design explícita no comentário do código (evita nova tabela; a Auditoria já é o feed que os
revisores acompanham).

| função | regra |
|---|---|
| `cobrarAcao({acaoId, mensagem?})` | só prefeito ou secretário dono podem cobrar; só permite se `computeStatusAcao(acao) === 'atraso'`; **cooldown de 12h** por ator/ação (evita spam); retorna `CobrarResultado` (union `{ok:true}` \| `{ok:false, erro}`) em vez de lançar — pensado para chamada via `fetch`/transition no client, não via `<form action>` |
| `responderCobranca({cobrancaId, mensagem})` | só o `responsavelId` da ação pode responder; uma cobrança só pode ser respondida **uma vez** |
| `comentarAcao({acaoId, mensagem})` | canal do chefe (que não cobra ninguém — está na base da hierarquia) para anexar contexto; visível a quem tem escopo de visibilidade sobre a ação ou é o próprio responsável |

> Nota de design importante: **chefe nunca cobra** (não tem subordinado na hierarquia de
> trabalho de 1 nível), só responde quando ele mesmo é o cobrado, ou comenta livremente.

### 7.5 `actions/usuarios.ts` — `criarUsuario`

Cadastra `Usuario` + `Lotacao` inicial. Prefeito pode atribuir qualquer `perfil` em qualquer
secretaria (`user.manageSecretaria`); secretário só pode cadastrar `perfil="chefe"` dentro das
suas próprias secretarias. Valida e-mail único (normalizado para minúsculas) e que a divisão
pertence à secretaria escolhida. ID gerado como `'u_' + timestamp36 + random4`.

**Senha inicial gerada no servidor** (`gerarSenhaInicial`); o banco guarda só o hash. A senha é
devolvida **uma única vez** no estado da action. A assinatura é
`(estadoAnterior, formData) => EstadoCriarUsuario` para uso com `useActionState`; erros são
retornados como `{ erro }` em vez de lançados. `NovoUsuarioForm` mostra as credenciais com
botão de copiar, sem redirecionar (redirecionar perderia a senha).

### 7.6 `actions/auth.ts` — `entrar` / `sair`

`entrar(estado, formData)`: Zod no input, `destinoSeguro(callbackUrl)` (só caminhos internos;
bloqueia open redirect `//host`, `/\host`, URLs absolutas e `/login`), chama
`signIn('credentials', …)`. Converte `LimiteDeTentativas` em "Muitas tentativas…" e qualquer
outro `AuthError` na mensagem genérica. Relança o resto (inclusive o `NEXT_REDIRECT` do sucesso).
`sair()`: `signOut({ redirectTo: '/login' })`.

---

## 8. Rotas (App Router) — `src/app/(app)/*`

Todas as páginas são **Server Components async** com `export const dynamic = 'force-dynamic'`
(sem cache — sempre busca dado fresco, coerente com um painel de gestão). Padrão: chamar
`getCurrentUser()`, buscar dados com `prisma`, filtrar com funções de `rbac.ts`, renderizar.

| rota | arquivo | resumo |
|---|---|---|
| `/login` | `app/login/page.tsx` + `LoginForm.tsx` | **única página pública**. Formulário e-mail/senha (sem cadastro/recuperação); preserva o e-mail após erro; `callbackUrl` volta à rota original |
| `/api/auth/*` | `app/api/auth/[...nextauth]/route.ts` | endpoints do Auth.js (públicos por definição) |
| `/` | `app/page.tsx` | apenas `redirect('/painel')` |
| `/painel` | `painel/page.tsx` | dashboard: métricas gerais (progresso, metas ativas, ações em atraso, propostas pendentes), banner + painel de **ações em atraso com cobrança**, **próximos prazos**, **ranking de secretarias por período** (só prefeito), caixa de propostas pendentes. Lógica pesada de reconstrução de "situação no passado" a partir de `AcaoSnapshot` para calcular deltas (30/60/90/180/360 dias / total) |
| `/metas` | `metas/page.tsx` | lista filtrável (secretaria, status, tipo, arquivada) respeitando `filterVisibleMetas`; barra de progresso por meta; botões condicionais "Nova meta" / "Nova proposta" conforme RBAC |
| `/metas/nova` | `metas/nova/page.tsx` + `NovaMetaForm.tsx` | formulário de criação (só quem tem `meta.create`); se ninguém tem permissão, mostra aviso e link para proposta |
| `/metas/[id]` | `metas/[id]/page.tsx` | detalhe: fatos da meta, tabela de ações com status derivado, formulário inline de "atualizar progresso" (`updateAcao`) por ação, quando o usuário tem permissão |
| `/metas/[id]/editar` | `metas/[id]/editar/page.tsx` | edição da meta (nome, tipo [só prefeito], divisão executora, participantes) + CRUD completo de ações (criar/editar/excluir) inline via `<details>`; arquivamento (só prefeito) |
| `/propostas` | `propostas/page.tsx` | 3 blocos: **Aguardando você** (ação necessária), **Suas propostas** (autoria), **Outras propostas visíveis** (escopo de `podeComentarProposta`); aprovar/rejeitar inline |
| `/propostas/nova` | `propostas/nova/page.tsx` + `NovaPropostaForm.tsx` | formulário adaptativo por `tipo`; se veio de `?metaId=`, trava tipo="edicao" e a meta alvo; calcula e mostra o `proximoRevisorDe` como preview |
| `/propostas/[id]` | `propostas/[id]/page.tsx` | **timeline** (eventos de auditoria da proposta, ordenados) + **conversa** (comentários estilo chat, bolhas alinhadas por autor) |
| `/usuarios` | `usuarios/page.tsx` | lista de pessoas (só prefeito/secretário acessam; senão `redirect('/painel')`); filtro por secretaria/perfil |
| `/usuarios/novo` | `usuarios/novo/page.tsx` + `NovoUsuarioForm.tsx` | cadastro (`criarUsuario`) |
| `/auditoria` | `auditoria/page.tsx` | feed de eventos com **RBAC de leitura em 2 critérios (OR)**: ator sob meu escopo hierárquico OU entidade (meta/ação) sob meu escopo — resolve o caso "prefeito cobrou uma ação da minha secretaria" (o ator não é meu, mas a entidade é). Filtros por tag/entidade/ator, limitado a 300 registros |
| `/organograma` | `organograma/page.tsx` | árvore secretaria → divisão → pessoas, escopo de leitura via `readableSecretariasOf` |

---

## 9. Componentes compartilhados (`src/components/`)

- **`AppShell.tsx`** (Server Component) — layout raiz de toda tela autenticada: topbar (logo,
  nome do app, iniciais + nome + perfil do usuário logado, botão **Sair**), sidebar (`SidebarNav`,
  contagem de propostas pendentes do usuário, rodapé com logos Cubic light/dark), `<main>` com o
  conteúdo da rota. Chama `requireUser()`: sem sessão válida, redireciona para `/login`.
- **`SidebarNav.tsx`** (Client) — menu lateral; usa `usePathname()` para destacar item ativo;
  item "Usuários" fica desabilitado (`disabled`) se `!canUsers`; badge numérico em "Propostas".
- **`SeletorTema.tsx`** (Client) — área **"Aparência"** fixa no menu (barra lateral e gaveta do
  celular): mostra o tema atual e abre as 5 opções. Aplica na hora (`data-theme` no `<html>`) e
  grava no usuário pela action `salvarTema` (`actions/preferencias.ts`). Ver seção 21.
- **`MenuMovel.tsx`** (Client) — botão ☰ + gaveta com o menu em telas < 1024 px (seção 20).

---

## 10. Biblioteca utilitária (`src/lib/format.ts`)

Núcleo das regras de **cálculo de progresso, prazo e status** — é o arquivo mais crítico para
entender o "motor" de negócio do sistema.

```ts
fmtPct(n: number): string                 // 0.5 → "50%"
fmtDate / fmtDateTime / fmtMesAno         // formatação pt-BR
initials(name): string                     // "José Damato" → "JD"

// Tabela oficial de faixas de tempo (peso E prazo derivam daqui):
TEMPO_OPCOES = [
  { value:'ate_6m',    peso:6,  mesesMax:6  },
  { value:'7_12m',     peso:12, mesesMax:12 },
  { value:'13_24m',    peso:24, mesesMax:24 },
  { value:'25_36m',    peso:36, mesesMax:36 },
  { value:'acima_36m', peso:48, mesesMax:48 },
]

pesoDeTempo(tempo): number                 // peso da ação no cálculo ponderado da meta
mesesMaxDeTempo(tempo): number | null
parseMesInicio("YYYY-MM"): Date | null     // 1º dia do mês
calcPrazoFinal(inicio, tempo): Date | null // inicio + mesesMax(tempo), último dia do mês final
calcPrazoMetaFinal(acoes[]): Date | null   // prazo da META = prazo mais distante entre suas ações

computeStatusAcao(a, hoje = now): 'nao_iniciada' | 'andamento' | 'atraso' | 'concluida'
  // situacaoAtual >= 0.99 (ou status="concluida" salvo)  → concluida
  // hoje < inicio                                        → nao_iniciada
  // hoje > calcPrazoFinal(inicio, tempo)                 → atraso
  // caso contrário                                       → andamento
  // ⚠️ Este cálculo é a fonte de verdade — o campo `Acao.status` no banco é só um cache/legado.

pctFromAcoes(acoes: {situacaoAtual, peso}[]): number
  // fórmula (replica coluna V=U/T da planilha original):
  //   soma(situacaoAtual_i * peso_i) / soma(peso_i)
  // situacaoAtual já normalizada 0–1, então funciona igual para "%" e outras unidades —
  // a unidade só muda a EXIBIÇÃO, não o cálculo.

fmtAlvo(alvo, unidade): string             // "50%" | "R$ 5.000" | "30 un"
labelDeTempo(tempo): string                // label humano da faixa
```

**Onde essas funções são consumidas**: `painel/page.tsx` (métricas e ranking),
`metas/page.tsx` e `metas/[id]/page.tsx` (progresso e prazo exibidos), `actions/metas.ts` e
`actions/propostas.ts` (recalcular peso ao mudar `tempoNecessario`), `actions/cobrancas.ts`
(só permite cobrar se `computeStatusAcao === 'atraso'`).

---

## 11. Design system / tokens visuais (`src/app/globals.css`)

CSS puro + Tailwind. Variáveis CSS base = paleta "papel & tipografia serifada" (tema `classico`,
sem `data-theme`, segue `prefers-color-scheme`), redefinidas por `data-theme` nos outros 4 temas.
O tema **padrão da plataforma é `azul`** (Azul Cubic) — ver seção 21.

| variável | uso |
|---|---|
| `--paper`, `--paper-2`, `--paper-3` | fundos (claro → escuro) |
| `--panel` | fundo de cards/paineis (branco no claro) |
| `--ink`, `--ink-2`, `--ink-3` | texto (forte → fraco) |
| `--rule`, `--rule-strong` | bordas/divisores |
| `--navy`, `--navy-2`, `--navy-surface`, `--navy-surface-2` | cor institucional (topbar, botão primário) |
| `--brass`, `--brass-2`, `--on-brass` | cor de destaque/marca (dourado) |
| `--ok`, `--warn`, `--late` | semáforo de status (verde/âmbar/vermelho) |

Fontes: `.font-display` = Fraunces (títulos), `.font-mono` = IBM Plex Mono (labels, códigos,
números tabulares), corpo = IBM Plex Sans.

Classes utilitárias reaproveitadas em quase toda página: `.btn` (+ `.btn-primary`, `.btn-brass`,
`.btn-ghost`, `.btn-danger`, `.btn-sm`), `.pill` (+ `.pill-ok/-warn/-late/-nav/-brass/-neutral`),
`.tbl` (tabelas), `.panel`, `.field`/`.field-lbl`, `.input`/`.select`/`.textarea`,
`.progress`/`.progress-bar`, `.rbac-note` (caixa de aviso de permissão negada/escopo).

---

## 12. Dados de seed (`prisma/seed.ts`)

Roda via `npm run db:seed` (parte de `db:setup` e `db:reset`). Contém:

1. **Organograma real e completo** da Prefeitura de Ubá: 12 secretarias (`secretarias[]`,
   IDs como `sec_seg`, `sec_sau`...), suas divisões (`divisoes[]`), e os usuários reais
   (prefeito + 1 secretário por secretaria + alguns chefes de divisão), com `lotacoes`.
   Hierarquia confirmada: **prefeito → secretário → chefe** (perfil "funcionário" foi removido;
   ex-funcionários viraram "chefe" nas mesmas lotações — ver comentário no arquivo).
2. **Metas de longo prazo** (`metasLP`): só os capítulos de Segurança Pública/Defesa Civil
   (04/16) e Mobilidade Urbana (12) foram carregados até o momento — as demais secretarias
   aguardam levantamento do conteúdo real do plano de governo.
3. **Metas de curto prazo** (`metasCP`): ~31 metas reais extraídas do PDF do plano de governo
   (capítulos 4.1, 16.1, 12.1), todas `tipo:"principal"`, todas sob `sec_seg`, com
   `participantes` cruzando outras secretarias quando aplicável (ex.: META013 com `sec_gab`).
4. **Ações**: dados simulados ("~60% das metas concluídas, resto em andamento/atraso") para dar
   textura de demonstração ao painel — não são dados reais de execução.
5. **Senhas iniciais**: uma senha aleatória por usuário, gravada só como hash e **impressa uma
   única vez no terminal** ao fim do seed.

**Trava de segurança**: o seed apaga tudo antes de semear, por isso **aborta se o banco já tem
usuários**. Para recriar o banco de desenvolvimento use `npm run db:reset`. Tudo é gravado numa
única transação (se cair no meio, o banco continua vazio).

**Modo `--producao`** (usado no start do Render): com banco já populado, sai sem fazer nada
(exit 0). Com banco vazio, exige `SENHA_INICIAL_ADMIN` (12 a 72 caracteres; senão exit 1 e o
deploy falha com a mensagem no log) e cria o organograma, as metas LP/CP reais e **apenas o
prefeito** (`prefeito@uba.mg.gov.br`) com essa senha. **Não** cria as ações de progresso simulado
e **não imprime senhas**. Os demais usuários são cadastrados pelo prefeito em `/usuarios/novo`.

`prisma/definir-senha.ts` (`npm run usuario:senha -- <email>`) — CLI do administrador: gera nova
senha, grava o hash, incrementa `sessaoVersao` (derruba sessões abertas) e imprime a senha uma vez.

`prisma/test-metas.ts` — utilitário de dev (`npm run test-metas:add` / `:remove`) para
inserir/remover metas de teste sem mexer no seed principal (não lido em detalhe neste
levantamento).

---

## 13. Scripts npm (`package.json`)

```bash
npm run dev              # next dev — servidor de desenvolvimento (porta 3000)
npm run build            # prisma generate && next build
npm run start            # PRODUÇÃO: verificar-ambiente && db:deploy && seed --producao (só age em banco vazio) && next start
npm run db:deploy        # trava de migrações (verificar-migracoes.ts) && prisma migrate deploy — nunca usar migrate dev em produção
npm run db:setup         # [só banco local] prisma migrate dev && seed (banco novo de desenvolvimento)
npm run db:seed          # roda prisma/seed.ts via tsx (só em banco totalmente vazio)
npm run db:reset         # [só banco local] prisma migrate reset --force && seed  ⚠️ DESTRÓI o banco local
npm run db:studio        # prisma studio — GUI do banco
npm run usuario:senha -- <email>   # redefine a senha de um usuário (admin)
npm run test-metas:add   # [só banco local] tsx prisma/test-metas.ts add
npm run test-metas:remove           # [só banco local]
# [só banco local] = passa antes por prisma/somente-local.ts, que recusa se a DATABASE_URL não for
# localhost/127.0.0.1 ou se RENDER=true / NODE_ENV=production.
docker compose -f docker-compose.dev.yml up -d   # sobe o Postgres de desenvolvimento
```

`.claude/launch.json` (em `Plano de Metas/.claude/`) configura o Claude Code Browser para
subir `npm --prefix app run dev` na porta 3000. **O dev server precisa rodar com o diretório
de trabalho em `app/`**: o Tailwind resolve `content: ['./src/**']` a partir do cwd. Se rodar
de outra pasta, nenhum utilitário é gerado, e o cache do webpack mantém o CSS vazio até apagar `.next`.

---

## 14. Convenções do código

- **Idioma de domínio**: nomes de tabelas, campos, funções de negócio e mensagens de erro em
  **português**. Nomes técnicos genéricos (tipos utilitários, imports de libs) em inglês.
- **IDs legíveis, não UUID**: entidades de negócio (`MetaCP`, `Acao`, `Proposta`) usam prefixo +
  timestamp base36 (`MCP-...`, `ACAO-...`, `PROP-...`); tabelas de apoio (`Lotacao`,
  `Comentario`, `Auditoria`, `AcaoSnapshot`) usam `cuid()`.
- **Nunca hard-delete em entidades com histórico relevante** (`MetaCP` → arquivamento com
  justificativa obrigatória). `Acao` ainda é hard-delete (`deletarAcao`) — inconsistência a
  observar se o negócio pedir preservar histórico de ações também.
- **Toda escrita passa por Server Action com **1) `getCurrentUser()` (nunca confiar só no
  middleware), 2) checagem RBAC (`can`/`requireCan`), 3) validação Zod, 4) `prisma.auditoria.create`
  correspondente**. Ao adicionar uma nova mutação, siga esse padrão para manter o feed de
  auditoria completo.
- **Server Actions são endpoints públicos (POST)**: qualquer usuário logado pode chamá-las com
  qualquer argumento, inclusive IDs de outras secretarias. Nunca confie que a UI só mostra o botão
  a quem pode; revalide tudo no servidor, inclusive o **status** atual da entidade e o
  **vínculo entre IDs** recebidos (ex.: a meta pertence à secretaria declarada?).
- **Identidade vem só de `getCurrentUser()`**: o usuário (`UsuarioSessao`) já traz `nome` e
  `email`, então não é preciso consultar o banco de novo para o nome do ator na auditoria.
- **SQL cru só parametrizado**: há `$queryRaw` apenas na forma de tagged template (valores viram
  parâmetros `$1, $2…`, sem concatenação) em `lib/painel.ts` (situação passada por ação),
  `propostas/page.tsx` (última nota por proposta, `DISTINCT ON`) e nos scripts de `prisma/`. Nunca
  `$queryRawUnsafe`/`$executeRawUnsafe`.
- **Nunca carregar `senhaHash` à toa**: consultas de usuário usam `select` só com os campos
  exibidos (nome, perfil…). `findMany()` sem `select` em `Usuario` traz o hash junto.
- **Listas que crescem com o uso são limitadas**: metas paginadas (50), propostas "Suas"/"Outras"
  (50 + "Ver mais"), auditoria (300 mais recentes). Não volte a carregar tabelas inteiras.
- **Segredos só em `.env`** (fora do versionamento); documente toda variável nova em `.env.example`.
- **Status derivado, não armazenado como verdade**: `Acao.status` no banco é um cache
  desatualizável; a UI e as regras de negócio (cobrança, filtros) sempre recalculam via
  `computeStatusAcao()`. Se for adicionar uma nova regra de "atraso", mexa em `format.ts`, não
  no campo do banco.
- **Cobranças/comentários/respostas não têm tabela própria** — são `Auditoria` com tags
  convencionadas (seção 4.5) e `parentId` para threading. Ao consultar "todas as cobranças de
  uma ação", filtre `entidade:'acao', entidadeId, tag:'ACAO:COBRANCA'`.
- **`revalidatePath` explícito após toda mutação** (Next.js App Router não invalida automaticamente
  Server Components) — ao adicionar uma rota nova que lê dados afetados por uma action existente,
  lembre de adicionar o `revalidatePath` correspondente.
- **Componentes client (`'use client'`) só onde há interatividade real** (formulários dinâmicos,
  dropdowns, transitions) — toda leitura de dados fica em Server Components.

---

## 15. Glossário de domínio

| termo (pt-BR) | significado |
|---|---|
| **Meta LP** | Meta de Longo Prazo — mapeia 1 capítulo do plano de governo (2025–2028) |
| **Meta CP** | Meta de Curto Prazo — a unidade de trabalho real, filha de uma Meta LP |
| **Ação** | Item mensurável dentro de uma Meta CP; tem peso, alvo, situação atual, responsável |
| **Situação atual** | Progresso da ação, 0–1 no banco (exibido como %) |
| **Peso** | Derivado da faixa de "tempo necessário"; usado na média ponderada do progresso da meta |
| **Secretaria dona** | Secretaria responsável pela meta |
| **Divisão executora** | Divisão (dentro da secretaria dona) que efetivamente executa a meta |
| **Secretarias participantes** | Secretarias além da dona, envolvidas numa meta conjunta (visibilidade estendida) |
| **Proposta** | Pedido de mudança (nova meta / editar meta / ajustar ação) que sobe o fluxo de aprovação |
| **Próximo revisor** | Quem precisa agir na proposta agora: `chefe` → `secretario` → `prefeito` |
| **Aplicar proposta** | Após aprovação final, o `payloadJson` é convertido em mudança real na Meta/Ação |
| **Cobrança** | "Nudge" formal de um superior sobre uma ação em atraso (cooldown de 12h) |
| **Lotação** | Vínculo de um usuário a uma (secretaria, divisão?) — usuário pode ter várias |
| **Sessão revogada** | JWT ainda válido criptograficamente, mas recusado porque `sessaoVersao` mudou ou o usuário foi desativado |
| **Arquivar (meta)** | Soft-delete com justificativa obrigatória; preserva todo o histórico |

---

## 16. Limitações conhecidas / pendências de produção (ler antes de propor mudanças)

1. **Sem troca de senha pelo próprio usuário** nem troca obrigatória no primeiro acesso: a senha
   inicial gerada pelo admin continua valendo até alguém rodar `usuario:senha`.
2. **Sem UI para desativar usuário/revogar sessões**: o campo `ativo` e o `sessaoVersao` já são
   respeitados, mas só dá para alterá-los por script/banco.
3. **Headers de segurança ainda não configurados** (CSP com nonce, HSTS, X-Frame-Options,
   Referrer-Policy, Permissions-Policy). (`poweredByHeader` já está desligado em `next.config.mjs`.)
4. **Rate limit só no login.** Server Actions críticas (aprovar/rejeitar proposta, cobrar, criar
   usuário, atualizar ação) ainda não têm limite.
5. **Zod não cobre 100% das actions**: `arquivarMetaCP`, `deletarAcao`, `aprovarProposta`,
   `rejeitarProposta` e `responderProposta` ainda leem `String(formData.get(...))` direto.
6. **Storage de anexos não implementado**: o model `Anexo` existe, mas não há `src/lib/storage.ts`,
   upload nem rota de download.
7. **Dados do SQLite antigo (`prisma/dev.db`) não foram migrados** para o Postgres (há usuários,
   metas, propostas e auditoria que não vêm do seed).
8. **`Acao.status`, `Acao.prazo` e `Divisao.chefeId`** têm campos que parecem não ser mais a fonte
   de verdade (substituídos por cálculo em `format.ts`) ou não são escritos por nenhuma action
   conhecida. Verifique antes de assumir que estão sincronizados.
9. **`deletarAcao` é hard delete**, inconsistente com o soft-delete de `MetaCP`, e vai falhar
   (FK `Restrict`) quando a ação tiver anexos.
10. **Sem testes automatizados, sem CI.**
11. **Dados de progresso das ações no seed são simulados** ("textura de demonstração"), não
    refletem execução real do plano de governo.

---

## 17. Deploy no Render (`render.yaml`)

Blueprint com dois recursos na região `virginia` (o Render não tem região no Brasil):

| recurso | configuração |
|---|---|
| `planometas-db` (Postgres 16) | `plan: free`; `ipAllowList: []` = **nenhum acesso externo**, só o web service pela rede privada |
| `plano-de-metas` (web, Node 24 via `engines`) | build `npm ci --include=dev && npm run build`; start `npm run start`; health check `/login`; deploy automático a cada commit |

Variáveis de ambiente obrigatórias: `DATABASE_URL` (Internal URL do banco), `AUTH_SECRET` e
`SENHA_INICIAL_ADMIN` (`sync: false`: o Blueprint pede o valor **só na criação**). Ao detectar
`RENDER=true` o código liga sozinho o `trustHost` do Auth.js (`auth.config.ts`) e o IP pelo 1º item
do XFF — sem isso, cada login gera erro `UntrustedHost`. O Render define `NODE_ENV=production` e
`PORT=10000` só em runtime, por isso o build instala as devDependencies (Prisma CLI, tsx, Tailwind, TS).

**Serviço criado manualmente** (New → Web Service, sem Blueprint): funciona com os comandos
padrão do Render (`npm install; npm run build` / `npm run start`), desde que se crie um Postgres na
**mesma região** e se cadastrem as 3 variáveis acima no painel (Environment). Foi o caminho usado
no primeiro deploy real (`plat-hfjl.onrender.com`).

- **Diagnóstico**: a mensagem JSON `There was a problem with the server configuration` vem do
  `assertConfig` do Auth.js e significa host não confiável (`UntrustedHost`) ou `AUTH_SECRET` ausente
  (`MissingSecret`), nesta ordem. O `verificar-ambiente.ts` agora pega isso no start e diz qual falta.
- **Migrations rodam no `npm run start`** (`db:deploy`), não em `preDeployCommand`, que só existe em
  planos pagos. `migrate deploy` é idempotente e nunca recria o banco — mas aplica o que a migração
  mandar, por isso passa antes pela trava `verificar-migracoes.ts` (seção 18). Se o start falhar, o
  Render mantém a versão anterior no ar.
- **Inicialização automática**: o `seed --producao` no start cria organograma, metas e o login
  `prefeito@uba.mg.gov.br` com a senha de `SENHA_INICIAL_ADMIN` quando o banco está vazio; nos
  starts seguintes não faz nada. Sem terminal, sem liberar IP e sem senha nos logs.
- **Não há upload direto de pasta**: o Render só faz deploy a partir de GitHub/GitLab/Bitbucket
  ou de imagem Docker. O caminho sem terminal é o GitHub Desktop (arrastar a pasta `app`, publicar
  como privado).
- **Plano gratuito**: o Postgres é **apagado 30 dias após a criação** (+14 de carência), e o web
  service dorme após 15 min sem acesso (~1 min para acordar). Não serve para dados reais.
- **Validado localmente** (cópia limpa, `npm install` + `npm run build` + `npm run start` em modo
  produção só com `RENDER=true` e as 3 variáveis): migrations + login do prefeito criados no 1º
  start, nada alterado no restart, 0 erros `UntrustedHost`, cookies `__Secure-` atrás de HTTPS,
  rate limit com o IP do 1º item do XFF, 401/307 sem sessão.

---

## 18. Atualizações seguras — os dados do cliente nunca são apagados nem alterados

Regra do produto: **publicar uma versão nova nunca pode apagar o banco nem mexer no que o cliente
já lançou.** O que garante isso:

| camada | o que faz |
|---|---|
| Banco separado do site | O Postgres é um recurso próprio no Render; build e deploy do site não tocam nele. O `build` não acessa o banco. |
| `prisma/verificar-migracoes.ts` (`npm run db:deploy`, dentro do `start` e do `.bat`) | Antes do `migrate deploy`, lê as migrações **ainda não aplicadas** e cancela o start se alguma tiver `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`, `UPDATE … SET`, `ALTER COLUMN … TYPE` ou `RENAME`. Nada é alterado e, no Render, a versão anterior continua no ar. Também avisa se uma migração já aplicada foi editada (a edição não vale) e se o banco tem migrações que o código não conhece (versão antiga publicada). |
| `prisma migrate deploy` | Só aplica migrações pendentes, em ordem; nunca recria o banco (quem recria é `migrate reset`/`migrate dev`, que não rodam em produção). |
| `prisma/seed.ts --producao` | Roda a cada start, mas só semeia banco **totalmente vazio** (confere 13 tabelas). Não tem mais nenhum `deleteMany` de dados. |
| `prisma/somente-local.ts` | `db:reset`, `db:setup` e `test-metas:*` recusam rodar se a `DATABASE_URL` não for desta máquina ou se for produção. |
| Escritas atômicas | `updateAcao` grava situação + snapshot + auditoria numa transação: uma falha no meio não deixa dado pela metade. |

**Como mudar o schema sem risco (padrão "expandir e depois contrair"):**
1. Só **acrescentar**: coluna nova opcional (`String?`) ou com `@default`, tabela nova, índice novo.
   Essas migrações passam pela trava sem intervenção.
2. Para **renomear** um campo: criar o novo, passar o código a gravar nos dois e ler do novo,
   copiar os valores antigos com uma migração de dados revisada, e só remover o antigo muito depois.
3. Migração que apaga/reescreve dados só com decisão explícita: **backup antes**, depois
   `MIGRACAO_DESTRUTIVA_AUTORIZADA=<nome_da_pasta_da_migracao>` nas variáveis do Render, deploy, e
   **remover a variável** em seguida.
4. Nunca editar uma migração já publicada; correções vão numa migração nova.
5. Nunca usar `prisma db push` nem `migrate dev`/`migrate reset` contra o banco de produção.

**Migração que falhou no meio**: o Prisma marca como falha e não aplica mais nada; a trava explica
e cancela o start. Resolver com `prisma migrate resolve --rolled-back <nome>` (depois de conferir o
banco) e publicar a migração corrigida com nome novo.

**O que o código NÃO resolve**: o Postgres **gratuito** do Render é apagado ~30 dias após a criação.
Para dados reais, use plano pago (tem backup automático) e ative os backups.

---

## 19. Desempenho — como as telas foram otimizadas (manter ao evoluir)

Medido em ambiente limitado igual ao plano Render de ~US$ 13 (site 0,5 CPU/512 MB + Postgres
0,1 CPU/256 MB), com dados de ~1 ano de uso (301 metas, 1.350 ações, 16 mil snapshots, 18 mil
eventos de auditoria, 150 propostas).

- **Painel** (`lib/painel.ts`):
  - metas e ações vêm **filtradas pelo banco** (`metasVisiveisWhere` em `rbac.ts`, espelho de
    `filterVisibleMetas`) e só com as colunas usadas;
  - a "situação de 30/60/90/180/360 dias atrás" é calculada no banco (uma busca indexada por ação e
    corte) e fica **10 min em cache para todos** — snapshots novos têm data de agora e não mudam
    cortes passados, então o cache não mostra número errado;
  - ações agrupadas por meta uma vez (`Map`), em vez de filtrar a lista inteira por meta/secretaria/período;
  - a lista de **ações em atraso** (cobranças, respostas, comentários) só é carregada quando o
    usuário abre o quadro (`actions/painel.ts`); na abertura vão só o total e as cobranças recebidas.
- **Metas**: paginação de 50, visibilidade no banco, colunas mínimas, ações agrupadas por meta.
- **Auditoria**: opções dos filtros por `groupBy` no banco (o `distinct` do Prisma lia a tabela
  inteira três vezes) e em cache de 2 min por usuário (`lib/cache-memoria.ts`); 100 eventos por
  página; índices `(atorId, quando)` e `(tag, quando)`.
- **Propostas**: só a última nota de cada proposta (`DISTINCT ON`), 50 por lista + "Ver mais",
  nomes de secretaria/divisão do cache de organização (5 min). Detalhe: eventos de aplicação
  buscados pelo índice `(tag, quando)` e pelo alvo da proposta (antes: varredura por texto).
- **Carregamento visível**: toda tela tem `loading.tsx` (esqueleto no formato da página, aparece no
  clique); botões de envio usam `BotaoEnviar` ("Salvando…").
- ⚠️ **Filtros, paginação e "Ver mais" usam navegação normal do navegador** (`<form method=get>` e
  `<a>`), **não** `<Link>`/`next/form`/`router.push`. No Next 15.5, numa rota com `loading.tsx`, a
  2ª troca seguida só de parâmetros da mesma tela (ex.: página 2 → 3) é descartada pelo roteador
  (ele reaproveita o esqueleto pré-carregado da URL sem parâmetros e cancela a resposta). Testado
  em Edge headless. O esqueleto continua aparecendo, porque o servidor o envia primeiro.
- **Links de linhas de tabelas/listas têm `prefetch={false}`**: com `loading.tsx`, cada link visível
  seria pré-carregado (50 pedidos ao servidor por página de Metas). O menu lateral mantém o
  pré-carregamento (esqueleto instantâneo).
- **Navegador**: fontes por `next/font` (servidas pelo próprio site, sem Google em tempo de uso);
  logos redimensionadas (`*-72.png`, ~5 KB cada, antes 178 KB somadas) e `loading="lazy"` (a logo
  escondida pelo tema não é baixada); cache de 7 dias para `/logo/*`.
- **Banco**: pool de 5 conexões (`lib/db.ts`, `DB_CONEXOES`); consultas de usuário sem `senhaHash`.

Ao criar telas novas: filtre no banco (não em memória), selecione só as colunas usadas, limite
listas que crescem, crie o `loading.tsx` da rota e use `BotaoEnviar` nos formulários.

---

## 20. Layout responsivo (celular, tablet, telas grandes)

Breakpoints do Tailwind: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280. Testado em Edge headless
nas larguras 360, 390, 768, 1024, 1366 e 1920 px, em todas as telas (0 estouro horizontal, inclusive
dentro da área principal), no modo claro e no escuro.

| faixa | estrutura (`components/AppShell.tsx`) |
|---|---|
| < 1024 px (celular, tablet em pé) | barra superior compacta e fixa no topo; menu em gaveta (`MenuMovel.tsx`: ☰, fecha ao navegar, no fundo escuro ou com Esc, trava a rolagem por trás); a página rola normalmente; "Sair" e a área "Aparência" (tema) ficam na gaveta |
| ≥ 1024 px | barra superior + barra lateral de 240 px; só a área principal rola (como antes) |
| ≥ 1400 px de conteúdo | o conteúdo fica centralizado com largura máxima de 1400 px |

**Classes utilitárias em `globals.css`** (bloco "RESPONSIVO"):
- `.tabela-rolavel`: envolve toda tabela; se ela não couber, rola de lado dentro do quadro.
- `.filtros` + `.select-filtro`: barra de filtros em grade 2 colunas no celular, em linha a partir de 768 px.
- `.popover-form`: menus flutuantes (Rejeitar, Arquivar) viram bloco abaixo do botão no celular.
- `.linha-atraso` / `.linha-atraso-acoes`: linha do quadro de atrasos; botões descem no celular.
- No celular: campos com 16 px (o Safari do iPhone dá zoom em campo menor), `.panel` e `.tbl` mais
  compactos, `.pill` pode quebrar linha. Em telas de toque, `.btn-sm` tem no mínimo 38 px de altura.

**Padrão das tabelas**: colunas secundárias somem por faixa (`hidden md:table-cell`,
`hidden lg:table-cell`…) e o dado reaparece dentro da 1ª coluna com o inverso (`md:hidden`), para
nada se perder no celular. Ex.: Metas (secretaria e prazo sob o nome), Auditoria (ator, tipo e
entidade junto do evento), Usuários (e-mail, perfil e lotações sob o nome), ações da meta.

**Grades**: números do painel `grid-cols-2 lg:grid-cols-4`; fatos da meta `2 → 3 → 5` colunas;
formulários de ação `1 → 3` (md) e `1 → 2` (sm); organograma `1 → 2` (lg). Os `loading.tsx` usam as
mesmas grades, e `EsqueletoTabela` converte larguras fixas em proporções.

**Modo escuro (tema Clássico)**: `--navy-surface` passou a ser escuro (#1F3E5C) no escuro — antes a
barra superior e os botões primários ficavam com texto claro sobre azul claro.

Ao criar telas novas: envolva tabelas em `.tabela-rolavel`, use grade com `grid-cols-1 sm:…`, some
colunas secundárias com o padrão acima e teste em 360 px.

---

## 21. Temas de cores por usuário

- **Padrão: Azul Cubic** (`TEMA_PADRAO` em `src/lib/temas.ts`) — vale na tela de login e para
  quem nunca escolheu (`Usuario.tema = null`).
- **Onde trocar**: área **"Aparência"** no menu (barra lateral ≥ 1024 px; gaveta ☰ no celular/tablet),
  componente `SeletorTema.tsx`. A troca aplica na hora e é gravada por `salvarTema`
  (`actions/preferencias.ts`: valida com Zod, só altera o próprio usuário; não vai para a
  auditoria por ser preferência visual). Se a gravação falhar, o tema volta ao anterior e avisa.
- **Acompanha o login**: fica no banco, não no navegador — vale em qualquer computador ou celular.
- **Sem "piscar"**: o `RootLayout` (`src/app/layout.tsx`) lê o tema via `getCurrentUser()`
  (memorizado por requisição; o campo vem na mesma consulta da sessão) e já entrega
  `<html data-theme="…">`. `classico` = sem atributo (segue claro/escuro do aparelho).
- **Temas disponíveis** (lista e amostras em `src/lib/temas.ts`; paletas em `globals.css`):
  `azul`, `turquesa`, `classico`, `petroleo`, `marrom`. Para criar um tema: bloco
  `:root[data-theme="novo"]` em `globals.css` com todas as variáveis + item em `TEMAS`.
- Substituiu o antigo `LayoutPicker` (faixa no topo + botão flutuante, salvo só em
  `localStorage`). As chaves antigas `app.layout*` no navegador são ignoradas.
- Migração `20260926120000_tema_do_usuario`: só `ADD COLUMN "tema" TEXT` (passa pela trava).
- `Iniciar Plano de Metas.bat` agora roda `prisma generate` depois das migrações, para o
  ambiente local reconhecer campos novos do schema.
