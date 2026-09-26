import { CarregandoTela, EsqueletoTitulo, EsqueletoFiltros, EsqueletoTabela } from '@/components/Esqueleto';

export default function CarregandoAuditoria() {
  return (
    <CarregandoTela rotulo="Carregando auditoria…">
      <EsqueletoTitulo largura={150} subtitulo={300} />
      <EsqueletoFiltros campos={3} />
      <EsqueletoTabela linhas={8} colunas={[140, 180, 120, '1fr', 180, 140]} />
    </CarregandoTela>
  );
}
