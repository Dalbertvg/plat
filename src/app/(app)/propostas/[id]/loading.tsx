import { CarregandoTela, Bloco } from '@/components/Esqueleto';

export default function CarregandoProposta() {
  return (
    <CarregandoTela rotulo="Carregando a proposta…">
      <Bloco w={90} h={28} className="mb-3" />
      <div className="panel mb-4" style={{ maxWidth: 720 }} aria-hidden>
        <div className="grid gap-2.5 mb-5">
          <Bloco w={120} h={10} />
          <Bloco w="70%" h={24} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {[0, 1, 2, 3, 4, 5].map(i => <Bloco key={i} w={i % 2 ? '70%' : '85%'} h={13} />)}
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 720 }} aria-hidden>
        <Bloco w={110} h={18} className="mb-5" />
        {[0, 1, 2].map(i => (
          <div key={i} className="grid gap-2 pb-5 pl-6">
            <Bloco w={160} h={11} />
            <Bloco w="55%" h={13} />
            <Bloco w="75%" h={12} />
          </div>
        ))}
      </div>
    </CarregandoTela>
  );
}
