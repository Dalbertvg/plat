'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { cobrarAcao, type CobrarResultado, responderCobranca, type ResponderResultado, comentarAcao, type ComentarResultado } from '@/actions/cobrancas';
import { listarAcoesAtrasadas } from '@/actions/painel';

export type RespostaCobranca = {
  atorNome: string;
  quando: string;
  msg: string;
};

export type CobrancaInfo = {
  id: string;
  atorId: string;
  atorNome: string;
  atorPerfil: string;
  quando: string; // ISO
  msg: string;
  resposta: RespostaCobranca | null;
};

export type ComentarioInfo = {
  atorNome: string;
  atorPerfil: string;
  quando: string; // ISO
  msg: string;
};

export type AcaoAtrasadaRow = {
  id: string;
  nome: string;
  metaCPId: string;
  metaCPNome: string;
  secretariaNome: string;
  divisaoNome: string;
  responsavelNome: string | null;
  responsavelPerfil: string | null;
  responsavelId: string | null;
  prazo: string | null;
  diasEmAtraso: number | null; // null quando não houver prazo parseável
  situacaoAtual: number;
  ultimaJustificativa: string | null;
  ultJustQuando: string | null;
  podeCobrar: boolean;
  podeComentar: boolean;                     // pode anexar mensagem livre (chefe, ou qualquer um no escopo)
  comentarios: ComentarioInfo[];             // mensagens já anexadas, visíveis a quem está no escopo

  // Perspectiva do usuário atual sobre as cobranças desta ação:
  minhaUltimaEm: string | null;              // cobrança que EU fiz (sou ator)
  cobrancasContraMim: CobrancaInfo[];        // cobranças que EU RECEBI (sou responsável ou estou na cadeia)
  cobrancasGerenciais: CobrancaInfo[];       // cobranças que EU POSSO VER (chefe/sec/prefeito), sem repetir as minhas
  souResponsavel: boolean;
  recebiCobranca: boolean;                   // na cadeia de notificação (responsável direto OU superior na hierarquia)
  escopoVisibilidade: boolean;               // pode VER esta ação no painel (inclui chefe da divisão, que não cobra)
};

type RowState = {
  loading: boolean;
  ok?: string;
  erro?: string;
};

type TabKey = 'atraso' | 'cobrancas';

// O painel manda só o total e as cobranças que o usuário recebeu. A lista
// completa (a parte mais pesada da tela) é buscada na primeira abertura.
export function AcoesAtrasadas({ total, rowsComCobranca }: { total: number; rowsComCobranca: AcaoAtrasadaRow[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('atraso');
  const [rows, setRows] = useState<AcaoAtrasadaRow[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [carregandoLista, startCarregarLista] = useTransition();

  if (total === 0) return null;

  const totalCobrancas = rowsComCobranca.length;

  const carregarLista = () => {
    setErroLista(null);
    startCarregarLista(async () => {
      try {
        setRows(await listarAcoesAtrasadas());
      } catch {
        setErroLista('Não foi possível carregar a lista agora.');
      }
    });
  };

  const abrirAba = (aba: TabKey) => {
    setOpen(true);
    setTab(aba);
    if (aba === 'atraso' && rows === null && !carregandoLista) carregarLista();
  };

  const listaPendente = tab === 'atraso' && rows === null;
  const rowsVisiveis = tab === 'cobrancas'
    ? rowsComCobranca
    : rows ?? [];

  return (
    <div className="mb-6 flex flex-col gap-3">
      {totalCobrancas > 0 && (
        <BannerCobrancasRecebidas rows={rowsComCobranca} onAbrir={() => abrirAba('cobrancas')} />
      )}

      {!open && (
        <button
          onClick={() => abrirAba('atraso')}
          className="w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-left transition-all"
          style={{
            padding: '14px 18px',
            background: 'linear-gradient(90deg, rgba(176,69,48,0.10), rgba(176,69,48,0.02))',
            border: '1px solid rgba(176,69,48,0.35)',
            borderLeft: '4px solid var(--late)',
            borderRadius: 3,
            cursor: 'pointer'
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-grid place-items-center rounded-full font-display font-semibold tabular-nums"
              style={{
                width: 38, height: 38,
                background: 'var(--late)', color: 'var(--paper-2)',
                fontSize: 18, flex: 'none'
              }}
              aria-hidden
            >
              {total}
            </span>
            <div className="min-w-0">
              <div className="font-display text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
                {total === 1 ? '1 ação em atraso precisa de você' : `${total} ações em atraso precisam de você`}
              </div>
              <div className="text-[14px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                Veja quem é o responsável e envie uma cobrança direta em um clique.
              </div>
            </div>
          </div>
          <span className="btn btn-brass btn-sm ml-auto" style={{ flex: 'none' }}>
            Ver e cobrar →
          </span>
        </button>
      )}

      {open && (
        <div
          className="panel"
          style={{
            borderTop: '4px solid var(--late)',
            padding: 'clamp(12px, 3vw, 18px) clamp(12px, 3vw, 20px) clamp(14px, 3vw, 20px)'
          }}
        >
          <div className="flex flex-wrap justify-between items-baseline gap-2 pb-3 mb-4 border-b" style={{ borderColor: 'var(--rule)' }}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <TabBtn active={tab === 'atraso'} onClick={() => abrirAba('atraso')} count={total}>
                  Ações em atraso
                </TabBtn>
                <TabBtn active={tab === 'cobrancas'} onClick={() => abrirAba('cobrancas')} count={totalCobrancas}>
                  Cobranças recebidas
                </TabBtn>
              </div>
              <div className="text-[13px] mt-1" style={{ color: 'var(--ink-3)' }}>
                {tab === 'atraso'
                  ? 'A cobrança fica registrada no histórico da ação e no feed de auditoria. Limite: uma por ator a cada 12h.'
                  : 'Ações em que você (ou sua equipe) recebeu cobrança de um superior.'}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Recolher ↑</button>
          </div>

          {listaPendente && erroLista ? (
            <div className="text-center py-6 text-[15px]" style={{ color: 'var(--ink-3)' }}>
              {erroLista}{' '}
              <button className="btn btn-sm ml-2" onClick={carregarLista} disabled={carregandoLista}>
                Tentar de novo
              </button>
            </div>
          ) : listaPendente ? (
            <div className="grid gap-2" role="status" aria-live="polite">
              <span className="sr-only">Carregando ações em atraso…</span>
              {Array.from({ length: Math.min(total, 4) }, (_, i) => (
                <div key={i} className="linha-atraso" aria-hidden>
                  <div className="esqueleto mx-auto" style={{ width: 52, height: 30 }} />
                  <div className="grid gap-2">
                    <div className="esqueleto" style={{ width: '55%', height: 16 }} />
                    <div className="esqueleto" style={{ width: '80%', height: 12 }} />
                  </div>
                  <div className="esqueleto linha-atraso-acoes" style={{ width: 96, height: 30 }} />
                </div>
              ))}
            </div>
          ) : rowsVisiveis.length === 0 ? (
            <div className="text-center py-6 text-[15px]" style={{ color: 'var(--ink-3)' }}>
              {tab === 'cobrancas' ? 'Nenhuma cobrança pendente no momento.' : 'Nenhuma ação em atraso.'}
            </div>
          ) : (
            <div className="grid gap-2">
              {rowsVisiveis.map(r => (
                <LinhaAtraso key={r.id} row={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, count, children }: {
  active: boolean; onClick: () => void; count: number; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="font-display text-[16px] font-semibold pb-1"
      style={{
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        borderBottom: active ? '2px solid var(--late)' : '2px solid transparent',
        background: 'none',
        cursor: 'pointer'
      }}
    >
      {children} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {count}</span>
    </button>
  );
}

function LinhaAtraso({ row }: { row: AcaoAtrasadaRow }) {
  const [state, setState] = useState<RowState>({ loading: false });
  const [pending, startTransition] = useTransition();
  const [showTxt, setShowTxt] = useState(false);
  const [msg, setMsg] = useState('');
  const [minhaUltimaEm, setMinhaUltimaEm] = useState<string | null>(row.minhaUltimaEm);

  const [showComentar, setShowComentar] = useState(false);
  const [comentarioTxt, setComentarioTxt] = useState('');
  const [comentarState, setComentarState] = useState<RowState>({ loading: false });
  const [comentarios, setComentarios] = useState(row.comentarios);
  const [comentarPending, startComentarTransition] = useTransition();

  const disparar = () => {
    if (!row.podeCobrar) return;
    setState({ loading: true });
    startTransition(async () => {
      try {
        const r: CobrarResultado = await cobrarAcao({ acaoId: row.id, mensagem: msg || undefined });
        if (r.ok) {
          setState({ loading: false, ok: 'Cobrança registrada' });
          setMinhaUltimaEm(r.quando);
          setMsg('');
          setShowTxt(false);
        } else {
          setState({ loading: false, erro: r.erro });
          if (r.ultimaEm) setMinhaUltimaEm(r.ultimaEm);
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Falha ao cobrar';
        setState({ loading: false, erro: errMsg });
      }
    });
  };

  const enviarComentario = () => {
    if (!row.podeComentar || !comentarioTxt.trim()) return;
    setComentarState({ loading: true });
    startComentarTransition(async () => {
      try {
        const r: ComentarResultado = await comentarAcao({ acaoId: row.id, mensagem: comentarioTxt.trim() });
        if (r.ok) {
          setComentarios(prev => [
            { atorNome: 'Você', atorPerfil: '', quando: new Date().toISOString(), msg: comentarioTxt.trim() },
            ...prev
          ]);
          setComentarState({ loading: false, ok: 'Mensagem anexada' });
          setComentarioTxt('');
          setShowComentar(false);
        } else {
          setComentarState({ loading: false, erro: r.erro });
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Falha ao anexar mensagem';
        setComentarState({ loading: false, erro: errMsg });
      }
    });
  };

  const badgeAtraso =
    row.diasEmAtraso == null
      ? { txt: 'sem prazo', tone: 'neutral' as const }
      : row.diasEmAtraso <= 7
      ? { txt: `${row.diasEmAtraso}d`, tone: 'warn' as const }
      : { txt: `${row.diasEmAtraso}d`, tone: 'late' as const };

  return (
    <div className="linha-atraso">
      <div className="text-center">
        <div
          className="font-mono text-[15px] font-semibold tabular-nums inline-block"
          style={{
            padding: '6px 10px',
            borderRadius: 3,
            background:
              badgeAtraso.tone === 'late' ? 'rgba(176,69,48,0.14)' :
              badgeAtraso.tone === 'warn' ? 'rgba(176,118,30,0.14)' : 'var(--rule)',
            color:
              badgeAtraso.tone === 'late' ? 'var(--late)' :
              badgeAtraso.tone === 'warn' ? 'var(--warn)' : 'var(--ink-3)'
          }}
        >
          {badgeAtraso.txt}
        </div>
        <div className="font-mono text-[11px] tracking-widest uppercase mt-1.5" style={{ color: 'var(--ink-3)' }}>
          em atraso
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            href={`/metas/${row.metaCPId}`}
            prefetch={false}
            className="font-medium text-[16px] hover:underline"
            style={{ color: 'var(--ink)' }}
            title={`Abrir meta: ${row.metaCPNome}`}
          >
            {row.nome}
          </Link>
          <span className="font-mono text-[12px] tracking-wider uppercase" style={{ color: 'var(--ink-3)' }}>
            {Math.round(row.situacaoAtual * 100)}% concluída
          </span>
        </div>
        <div className="text-[14px] mt-1" style={{ color: 'var(--ink-2)' }}>
          <span style={{ color: 'var(--navy)' }}>{row.secretariaNome}</span>
          <span style={{ color: 'var(--rule-strong)' }}> · </span>
          <span>{row.divisaoNome}</span>
          <span style={{ color: 'var(--rule-strong)' }}> · </span>
          <span>
            {row.responsavelNome ? (
              <>Responsável: <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{row.responsavelNome}</b>
                {row.responsavelPerfil && (
                  <span className="font-mono text-[11px] tracking-wider uppercase ml-1" style={{ color: 'var(--ink-3)' }}>
                    ({row.responsavelPerfil})
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--ink-3)' }}>Sem responsável designado</span>
            )}
          </span>
        </div>
        {row.ultimaJustificativa && (
          <div className="text-[13px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
            <span className="font-mono text-[11px] tracking-wider uppercase" style={{ color: 'var(--ink-3)' }}>última justificativa: </span>
            <span style={{ color: 'var(--ink-2)' }}>&ldquo;{row.ultimaJustificativa.slice(0, 120)}{row.ultimaJustificativa.length > 120 ? '…' : ''}&rdquo;</span>
          </div>
        )}

        {/* Recebi cobrança (responsável direto ou na cadeia hierárquica). */}
        {row.recebiCobranca && row.cobrancasContraMim.length > 0 && (
          <div
            className="mt-2.5 flex flex-col gap-1.5"
            style={{
              padding: '10px 12px',
              background: 'rgba(176,69,48,0.10)',
              borderLeft: '4px solid var(--late)',
              borderRadius: '0 3px 3px 0'
            }}
          >
            {row.cobrancasContraMim.slice(0, 3).map((c, i) => (
              <CobrancaRecebidaItem key={i} cobranca={c} />
            ))}
            {row.cobrancasContraMim.length > 3 && (
              <div className="font-mono text-[11px] tracking-wider uppercase" style={{ color: 'var(--ink-3)' }}>
                + {row.cobrancasContraMim.length - 3} anteriores
              </div>
            )}
          </div>
        )}

        {/* Visão gerencial (chefe/secretário/prefeito que não é ator nem responsável) —
            mostra quem já cobrou, para contextualizar as intervenções da equipe. */}
        {!row.recebiCobranca && row.cobrancasGerenciais.length > 0 && (
          <div
            className="mt-2.5 flex flex-col gap-1.5"
            style={{
              padding: '10px 12px',
              background: 'rgba(166,119,53,0.08)',
              borderLeft: '4px solid var(--brass)',
              borderRadius: '0 3px 3px 0'
            }}
          >
            <div className="font-mono text-[11px] tracking-wider uppercase mb-0.5" style={{ color: 'var(--brass)' }}>
              cobranças recentes:
            </div>
            {row.cobrancasGerenciais.slice(0, 3).map((c, i) => (
              <div key={i} className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{c.atorNome}</b>
                <span className="font-mono text-[11px] tracking-wider uppercase ml-1" style={{ color: 'var(--ink-3)' }}>
                  ({c.atorPerfil})
                </span>
                <span style={{ color: 'var(--ink-3)' }}> · {tempoRelativo(c.quando)}</span>
                {c.msg && <div className="text-[12.5px] italic mt-0.5" style={{ color: 'var(--ink-2)' }}>&ldquo;{c.msg}&rdquo;</div>}
                {c.resposta && (
                  <div className="text-[12.5px] mt-1 pl-3" style={{ borderLeft: '2px solid var(--rule-strong)' }}>
                    <span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: 'var(--ink-3)' }}>
                      resposta de {c.resposta.atorNome} · {tempoRelativo(c.resposta.quando)}
                    </span>
                    <div className="italic mt-0.5" style={{ color: 'var(--ink-2)' }}>&ldquo;{c.resposta.msg}&rdquo;</div>
                  </div>
                )}
              </div>
            ))}
            {row.cobrancasGerenciais.length > 3 && (
              <div className="font-mono text-[11px] tracking-wider uppercase" style={{ color: 'var(--ink-3)' }}>
                + {row.cobrancasGerenciais.length - 3} anteriores
              </div>
            )}
          </div>
        )}

        {/* Mensagens anexadas — o canal do chefe (e de qualquer um no escopo),
            sem ser uma cobrança de ninguém. */}
        {comentarios.length > 0 && (
          <div
            className="mt-2.5 flex flex-col gap-1.5"
            style={{
              padding: '10px 12px',
              background: 'var(--paper-3)',
              borderLeft: '4px solid var(--ink-3)',
              borderRadius: '0 3px 3px 0'
            }}
          >
            <div className="font-mono text-[11px] tracking-wider uppercase mb-0.5" style={{ color: 'var(--ink-3)' }}>
              mensagens anexadas:
            </div>
            {comentarios.slice(0, 3).map((c, i) => (
              <div key={i} className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{c.atorNome}</b>
                {c.atorPerfil && (
                  <span className="font-mono text-[11px] tracking-wider uppercase ml-1" style={{ color: 'var(--ink-3)' }}>
                    ({c.atorPerfil})
                  </span>
                )}
                <span style={{ color: 'var(--ink-3)' }}> · {tempoRelativo(c.quando)}</span>
                <div className="text-[12.5px] italic mt-0.5" style={{ color: 'var(--ink-2)' }}>&ldquo;{c.msg}&rdquo;</div>
              </div>
            ))}
            {comentarios.length > 3 && (
              <div className="font-mono text-[11px] tracking-wider uppercase" style={{ color: 'var(--ink-3)' }}>
                + {comentarios.length - 3} anteriores
              </div>
            )}
          </div>
        )}

        {showComentar && row.podeComentar && (
          <div className="mt-2 flex flex-wrap sm:flex-nowrap gap-2 items-start">
            <input
              value={comentarioTxt}
              onChange={e => setComentarioTxt(e.target.value)}
              maxLength={500}
              placeholder="Sua mensagem (obrigatória)"
              className="input"
              style={{ padding: '5px 8px', fontSize: 12 }}
              disabled={comentarPending}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarComentario(); } }}
            />
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={enviarComentario}
              disabled={comentarPending || !comentarioTxt.trim()}
            >
              {comentarPending ? 'Enviando…' : 'Enviar'}
            </button>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => { setShowComentar(false); setComentarioTxt(''); }}
              disabled={comentarPending}
            >
              Cancelar
            </button>
          </div>
        )}
        {comentarState.ok && (
          <div className="mt-1.5 font-mono text-[10.5px] tracking-wider uppercase" style={{ color: 'var(--ok)' }}>
            ✓ {comentarState.ok}
          </div>
        )}
        {comentarState.erro && (
          <div className="mt-1.5 text-[11px]" style={{ color: 'var(--late)' }}>
            {comentarState.erro}
          </div>
        )}

        {showTxt && row.podeCobrar && (
          <div className="mt-2 flex flex-wrap sm:flex-nowrap gap-2 items-start">
            <input
              value={msg}
              onChange={e => setMsg(e.target.value)}
              maxLength={280}
              placeholder="Mensagem opcional (aparece no histórico)"
              className="input"
              style={{ padding: '5px 8px', fontSize: 12 }}
              disabled={pending}
            />
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => { setShowTxt(false); setMsg(''); }}
              disabled={pending}
            >
              Cancelar
            </button>
          </div>
        )}

        {state.ok && (
          <div className="mt-1.5 font-mono text-[10.5px] tracking-wider uppercase" style={{ color: 'var(--ok)' }}>
            ✓ {state.ok}
          </div>
        )}
        {state.erro && (
          <div className="mt-1.5 text-[11px]" style={{ color: 'var(--late)' }}>
            {state.erro}
          </div>
        )}
      </div>

      <div className="linha-atraso-acoes flex flex-col gap-1">
        {(row.podeCobrar || row.podeComentar) ? (
          <div className="flex gap-1.5 flex-wrap justify-start sm:justify-end">
            {row.podeCobrar && !showTxt && (
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setShowTxt(true)}
                title="Adicionar uma mensagem à cobrança"
                disabled={pending}
              >
                + msg
              </button>
            )}
            {row.podeCobrar && (
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={disparar}
                disabled={pending || state.loading}
                title={row.responsavelNome
                  ? `Registrar cobrança para ${row.responsavelNome}`
                  : 'Registrar cobrança no histórico'}
              >
                {pending ? 'Enviando…' : 'Cobrar'}
              </button>
            )}
            {row.podeComentar && !showComentar && (
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setShowComentar(true)}
                title="Anexar uma mensagem — não é uma cobrança"
              >
                Comentar
              </button>
            )}
          </div>
        ) : (
          <span className="font-mono text-[9.5px] tracking-wider uppercase" style={{ color: 'var(--ink-3)' }}>
            fora do seu escopo
          </span>
        )}
        {minhaUltimaEm && (
          <span
            className="font-mono text-[9.5px] tracking-wider uppercase"
            style={{ color: 'var(--ok)', fontWeight: 600 }}
            title={new Date(minhaUltimaEm).toLocaleString('pt-BR')}
          >
            ✓ você cobrou {tempoRelativo(minhaUltimaEm)}
          </span>
        )}
      </div>
    </div>
  );
}

// Banner de topo — só aparece quando o USUÁRIO ATUAL é responsável de ao menos
// uma ação em atraso que RECEBEU cobrança. Prioridade alta: "seu chefe está te cobrando".
function BannerCobrancasRecebidas({ rows, onAbrir }: { rows: AcaoAtrasadaRow[]; onAbrir: () => void }) {
  // Cobrança mais recente contra mim entre todas as ações — pra destacar
  const todasContra = rows.flatMap(r => r.cobrancasContraMim.map(c => ({ ...c, acao: r.nome })));
  todasContra.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
  const maisRecente = todasContra[0];
  if (!maisRecente) return null;

  return (
    <div
      className="w-full flex flex-wrap sm:flex-nowrap items-start gap-3"
      style={{
        padding: '12px 16px',
        background: 'linear-gradient(90deg, rgba(176,69,48,0.16), rgba(176,69,48,0.04))',
        border: '1px solid rgba(176,69,48,0.45)',
        borderLeft: '3px solid var(--late)',
        borderRadius: 3
      }}
    >
      <span
        className="inline-grid place-items-center rounded-full font-display font-semibold tabular-nums"
        style={{
          width: 32, height: 32,
          background: 'var(--late)', color: 'var(--paper-2)',
          fontSize: 14, flex: 'none'
        }}
        aria-hidden
      >
        !
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[14.5px] font-semibold" style={{ color: 'var(--ink)' }}>
          Você foi cobrado{rows.length > 1 ? ` em ${rows.length} ações` : ''}
        </div>
        <div className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
          Última: <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{maisRecente.atorNome}</b>
          <span className="font-mono text-[9.5px] tracking-wider uppercase ml-1" style={{ color: 'var(--ink-3)' }}>
            ({maisRecente.atorPerfil})
          </span>
          <span style={{ color: 'var(--ink-3)' }}> · {tempoRelativo(maisRecente.quando)}</span>
          <span style={{ color: 'var(--ink-3)' }}> sobre </span>
          <span style={{ color: 'var(--ink-2)' }}>&ldquo;{maisRecente.acao}&rdquo;</span>
        </div>
      </div>
      <button onClick={onAbrir} className="btn btn-brass btn-sm ml-auto" style={{ flex: 'none' }}>
        Ver detalhes →
      </button>
    </div>
  );
}

function CobrancaRecebidaItem({ cobranca: c }: { cobranca: CobrancaInfo }) {
  const [showForm, setShowForm] = useState(false);
  const [respTxt, setRespTxt] = useState('');
  const [pending, startTransition] = useTransition();
  const [resposta, setResposta] = useState(c.resposta);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = () => {
    if (!respTxt.trim()) return;
    setErro(null);
    startTransition(async () => {
      try {
        const r: ResponderResultado = await responderCobranca({
          cobrancaId: c.id,
          mensagem: respTxt.trim()
        });
        if (r.ok) {
          setResposta({ atorNome: 'Você', quando: new Date().toISOString(), msg: respTxt.trim() });
          setShowForm(false);
          setRespTxt('');
        } else {
          setErro(r.erro);
        }
      } catch {
        setErro('Falha ao enviar resposta');
      }
    });
  };

  return (
    <div className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
      <span className="font-mono text-[11px] tracking-wider uppercase mr-1.5" style={{ color: 'var(--late)', fontWeight: 700 }}>
        cobrado
      </span>
      por <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.atorNome}</b>
      <span className="font-mono text-[11px] tracking-wider uppercase ml-1" style={{ color: 'var(--ink-3)' }}>
        ({c.atorPerfil})
      </span>
      <span style={{ color: 'var(--ink-3)' }}> · {tempoRelativo(c.quando)}</span>
      {c.msg && <div className="text-[13px] italic mt-1" style={{ color: 'var(--ink-2)' }}>&ldquo;{c.msg}&rdquo;</div>}

      {resposta ? (
        <div className="text-[13px] mt-1.5 pl-3" style={{ borderLeft: '2px solid var(--ok, #2a8a2a)' }}>
          <span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: 'var(--ok, #2a8a2a)' }}>
            sua resposta · {tempoRelativo(resposta.quando)}
          </span>
          <div className="italic mt-0.5" style={{ color: 'var(--ink-2)' }}>&ldquo;{resposta.msg}&rdquo;</div>
        </div>
      ) : (
        <>
          {!showForm && (
            <button
              className="btn btn-ghost btn-sm mt-1"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => setShowForm(true)}
            >
              Responder
            </button>
          )}
          {showForm && (
            <div className="mt-1.5 flex flex-wrap sm:flex-nowrap gap-2 items-start">
              <input
                value={respTxt}
                onChange={e => setRespTxt(e.target.value)}
                maxLength={500}
                placeholder="Sua justificativa (máx. 500 caracteres)"
                className="input flex-1"
                style={{ padding: '5px 8px', fontSize: 12 }}
                disabled={pending}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              />
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={enviar}
                disabled={pending || !respTxt.trim()}
                style={{ fontSize: 11 }}
              >
                {pending ? 'Enviando…' : 'Enviar'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => { setShowForm(false); setRespTxt(''); setErro(null); }}
                disabled={pending}
                style={{ fontSize: 11 }}
              >
                Cancelar
              </button>
            </div>
          )}
          {erro && (
            <div className="mt-1 text-[11px]" style={{ color: 'var(--late)' }}>{erro}</div>
          )}
        </>
      )}
    </div>
  );
}

function tempoRelativo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d}d`;
}
