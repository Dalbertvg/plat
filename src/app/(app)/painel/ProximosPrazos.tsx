import Link from 'next/link';
import { fmtMesAno } from '@/lib/format';

export type PrazoRow = {
  acaoId: string;
  acaoNome: string;
  metaCPId: string;
  metaCPNome: string;
  secretariaNome: string;
  prazo: Date;
  diasRestantes: number;
};

export function ProximosPrazos({ rows }: { rows: PrazoRow[] }) {
  return (
    <div className="panel">
      <div className="flex justify-between items-baseline pb-3 mb-4 border-b" style={{ borderColor: 'var(--rule)' }}>
        <div>
          <div className="font-display text-[18px] font-semibold">Próximos prazos</div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--ink-3)' }}>
            Ações (e as metas às quais pertencem) que ainda não venceram, ordenadas pelo prazo mais próximo.
          </div>
        </div>
        <Link href="/metas" className="font-mono text-[12px] tracking-wider uppercase" style={{ color: 'var(--brass)' }}>Ver todas →</Link>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-6 text-[14px]" style={{ color: 'var(--ink-3)' }}>
          Nenhum prazo futuro calculável no seu escopo.
        </div>
      ) : (
        <div style={{ background: 'var(--panel)' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Ação</th>
                <th>Meta</th>
                <th>Secretaria</th>
                <th style={{ width: 120 }}>Prazo</th>
                <th style={{ textAlign: 'right', width: 90 }}>Faltam</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const urgente = r.diasRestantes <= 30;
                return (
                  <tr key={r.acaoId}>
                    <td className="font-medium text-[13.5px]">{r.acaoNome}</td>
                    <td className="text-[12.5px]">
                      <Link href={`/metas/${r.metaCPId}`} className="hover:underline" style={{ color: 'var(--ink-2)' }}>
                        {r.metaCPNome}
                      </Link>
                    </td>
                    <td className="text-[12px]" style={{ color: 'var(--ink-3)' }}>{r.secretariaNome}</td>
                    <td className="text-[12.5px] tabular-nums">{fmtMesAno(r.prazo)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span
                        className="font-mono text-[12px] tabular-nums font-semibold"
                        style={{ color: urgente ? 'var(--warn)' : 'var(--ink-3)' }}
                      >
                        {r.diasRestantes}d
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
