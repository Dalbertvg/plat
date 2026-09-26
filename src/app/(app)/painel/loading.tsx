import { CarregandoTela, EsqueletoTitulo, EsqueletoPainelLista, Bloco } from '@/components/Esqueleto';

export default function CarregandoPainel() {
  return (
    <CarregandoTela rotulo="Carregando o painel…">
      <EsqueletoTitulo largura={150} subtitulo={330} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px mb-6 border" style={{ background: 'var(--rule)', borderColor: 'var(--rule)' }} aria-hidden>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="p-5 grid gap-2.5" style={{ background: 'var(--panel)' }}>
            <Bloco w={90} h={36} />
            <Bloco w={130} h={11} />
            <Bloco w={160} h={13} />
          </div>
        ))}
      </div>

      <div className="mb-6" aria-hidden>
        <Bloco h={68} />
      </div>

      <EsqueletoPainelLista titulo={170} itens={4} className="mb-4" />
      <div style={{ maxWidth: 720 }}>
        <EsqueletoPainelLista titulo={220} itens={3} />
      </div>
    </CarregandoTela>
  );
}
