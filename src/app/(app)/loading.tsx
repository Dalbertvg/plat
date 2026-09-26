import { CarregandoTela, EsqueletoTitulo, EsqueletoPainelLista } from '@/components/Esqueleto';

// Reserva para qualquer tela sem esqueleto próprio.
export default function Carregando() {
  return (
    <CarregandoTela rotulo="Carregando…">
      <EsqueletoTitulo />
      <EsqueletoPainelLista />
    </CarregandoTela>
  );
}
