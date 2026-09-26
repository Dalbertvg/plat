import { CarregandoTela, EsqueletoTitulo, EsqueletoFiltros, EsqueletoTabela } from '@/components/Esqueleto';

export default function CarregandoMetas() {
  return (
    <CarregandoTela rotulo="Carregando metas…">
      <EsqueletoTitulo largura={120} subtitulo={260} />
      <EsqueletoFiltros campos={4} />
      <EsqueletoTabela linhas={8} colunas={[80, '1fr', '0.7fr', '16%', 110, 50]} />
    </CarregandoTela>
  );
}
