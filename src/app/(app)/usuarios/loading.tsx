import { CarregandoTela, EsqueletoTitulo, EsqueletoFiltros, EsqueletoTabela } from '@/components/Esqueleto';

export default function CarregandoUsuarios() {
  return (
    <CarregandoTela rotulo="Carregando usuários…">
      <EsqueletoTitulo largura={150} subtitulo={300} acoes={1} />
      <EsqueletoFiltros campos={2} />
      <EsqueletoTabela linhas={8} colunas={['1fr', '1fr', 110, '1.2fr', 130, 80]} />
    </CarregandoTela>
  );
}
