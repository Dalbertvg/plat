import { CarregandoTela, EsqueletoTitulo, EsqueletoPainelLista } from '@/components/Esqueleto';

export default function CarregandoPropostas() {
  return (
    <CarregandoTela rotulo="Carregando propostas…">
      <EsqueletoTitulo largura={160} subtitulo={380} acoes={1} />
      <EsqueletoPainelLista titulo={200} itens={2} className="mb-4" />
      <EsqueletoPainelLista titulo={230} itens={5} />
    </CarregandoTela>
  );
}
