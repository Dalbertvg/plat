import { CarregandoTela, EsqueletoTabela, Bloco } from '@/components/Esqueleto';

export default function CarregandoMeta() {
  return (
    <CarregandoTela rotulo="Carregando a meta…">
      <Bloco w={150} h={28} className="mb-3" />
      <div className="panel mb-4" aria-hidden>
        <div className="grid gap-2.5 mb-4">
          <Bloco w="55%" h={24} />
          <Bloco w="35%" h={12} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5 pt-3.5 border-t" style={{ borderColor: 'var(--rule)' }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="grid gap-2">
              <Bloco w={70} h={10} />
              <Bloco w={90} h={20} />
            </div>
          ))}
        </div>
      </div>
      <EsqueletoTabela linhas={5} colunas={['1fr', 90, 90, 120, 140, 90]} />
    </CarregandoTela>
  );
}
