import { CarregandoTela, EsqueletoTitulo, EsqueletoPainelLista } from '@/components/Esqueleto';

export default function CarregandoOrganograma() {
  return (
    <CarregandoTela rotulo="Carregando organograma…">
      <EsqueletoTitulo largura={190} subtitulo={280} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map(i => <EsqueletoPainelLista key={i} titulo={200} itens={3} />)}
      </div>
    </CarregandoTela>
  );
}
