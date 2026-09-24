'use client';

import Link from 'next/link';
import { fmtPct } from '@/lib/format';

export type SecStat = {
  id: string;
  nome: string;
  metas: number;
  pct: number;
  deltas: Record<PeriodKey, number>;
};

export type PeriodKey = '30d' | '60d' | '90d' | '180d' | '360d' | 'total';

const PERIODS: { key: PeriodKey; short: string; full: string }[] = [
  { key: '30d',   short: '30d',  full: 'Últimos 30 dias' },
  { key: '60d',   short: '60d',  full: 'Últimos 60 dias' },
  { key: '90d',   short: '90d',  full: 'Últimos 90 dias' },
  { key: '180d',  short: '180d', full: 'Últimos 180 dias' },
  { key: '360d',  short: '360d', full: 'Últimos 360 dias' },
  { key: 'total', short: 'Tudo', full: 'Período completo (desde o início)' }
];

export function RankingSecretarias({ secStats }: { secStats: SecStat[] }) {
  return (
    <div className="panel">
      <div className="flex justify-between items-baseline pb-3 mb-4 border-b" style={{ borderColor: 'var(--rule)' }}>
        <div>
          <div className="font-display text-[18px] font-semibold">Ranking por secretaria</div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--ink-3)' }}>
            Progresso atual e ganho em cada janela de tempo. Δ = variação comparada a aquele número de dias atrás.
          </div>
        </div>
        <Link href="/metas" className="font-mono text-[12px] tracking-wider uppercase"
              style={{ color: 'var(--brass)' }}>Ver todas →</Link>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'right' }}>#</th>
              <th>Secretaria</th>
              <th style={{ width: 240 }}>Progresso</th>
              {PERIODS.map(p => (
                <th key={p.key} style={{ textAlign: 'right', width: 72 }} title={p.full}>
                  Δ {p.short}
                </th>
              ))}
              <th style={{ textAlign: 'right', width: 68 }}>Metas</th>
            </tr>
          </thead>
          <tbody>
            {secStats.map((s, i) => {
              const bar = s.pct < 0.3 ? 'late' : s.pct < 0.7 ? 'warn' : '';
              return (
                <tr key={s.id}>
                  <td style={{ textAlign: 'right', color: 'var(--ink-3)' }}>
                    <span className="font-mono text-[13px] tabular-nums">{i + 1}</span>
                  </td>
                  <td className="text-[15px]">{s.nome}</td>
                  <td>
                    <div className="grid grid-cols-[1fr_50px] gap-3 items-center">
                      <div className="progress"><div className={`progress-bar ${bar}`} style={{ width: `${s.pct * 100}%` }} /></div>
                      <div className="font-mono text-[13.5px] text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>{fmtPct(s.pct)}</div>
                    </div>
                  </td>
                  {PERIODS.map(p => (
                    <td key={p.key} style={{ textAlign: 'right' }}>
                      <DeltaCell delta={s.deltas[p.key]} />
                    </td>
                  ))}
                  <td style={{ textAlign: 'right' }}><code>{s.metas}</code></td>
                </tr>
              );
            })}
            {secStats.length === 0 && (
              <tr><td colSpan={3 + PERIODS.length + 1} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 22, fontSize: 15 }}>Nenhuma secretaria com metas visíveis.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeltaCell({ delta }: { delta: number }) {
  const pct = Math.round(delta * 100);
  if (Math.abs(pct) < 1) {
    return <span className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--ink-3)' }}>±0%</span>;
  }
  const positivo = pct > 0;
  return (
    <span
      className="font-mono text-[13.5px] tabular-nums font-semibold"
      style={{ color: positivo ? 'var(--ok)' : 'var(--late)' }}
    >
      {positivo ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}
