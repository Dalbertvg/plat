import { CarregandoTela, EsqueletoFormulario, Bloco } from '@/components/Esqueleto';

export default function CarregandoFormulario() {
  return (
    <CarregandoTela rotulo="Carregando o formulário…">
      <Bloco w={150} h={28} className="mb-4" />
      <EsqueletoFormulario campos={5} />
    </CarregandoTela>
  );
}
