// Peças dos esqueletos de carregamento (arquivos loading.tsx). Aparecem no
// instante do clique, dentro do layout (menu e topo continuam no lugar),
// enquanto o servidor monta a tela — em vez de a tela anterior ficar parada.
// Imitam o formato de cada página para a troca não "pular".

export function Bloco({ w = '100%', h = 14, className = '', style }: {
  w?: number | string; h?: number | string; className?: string; style?: React.CSSProperties;
}) {
  return <span className={`esqueleto ${className}`} style={{ width: w, height: h, maxWidth: '100%', ...style }} aria-hidden />;
}

// Envoltório comum: barra no topo + aviso para leitores de tela.
export function CarregandoTela({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <div className="barra-carregando" aria-hidden />
      <span className="sr-only">{rotulo}</span>
      {children}
    </div>
  );
}

export function EsqueletoTitulo({ largura = 220, subtitulo = 360, acoes = 0 }: {
  largura?: number; subtitulo?: number; acoes?: number;
}) {
  return (
    <div className="mb-6 flex flex-wrap justify-between items-start gap-4">
      <div className="grid gap-2.5 min-w-0 flex-1">
        <Bloco w={largura} h={30} />
        <Bloco w={subtitulo} h={14} />
      </div>
      {acoes > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: acoes }, (_, i) => <Bloco key={i} w={120} h={30} />)}
        </div>
      )}
    </div>
  );
}

export function EsqueletoFiltros({ campos = 4 }: { campos?: number }) {
  return (
    <div className="flex gap-2 mb-4 items-center flex-wrap" aria-hidden>
      <Bloco w={56} h={10} />
      {Array.from({ length: campos }, (_, i) => <Bloco key={i} w={150} h={32} />)}
      <Bloco w={70} h={32} />
    </div>
  );
}

// Larguras fixas por linha: variação que parece texto, sem trocar a cada
// render (Math.random causaria diferença entre servidor e navegador).
const LARGURAS = ['78%', '64%', '86%', '58%', '72%', '90%', '67%', '81%'];

export function EsqueletoTabela({ linhas = 10, colunas }: { linhas?: number; colunas: Array<number | string> }) {
  // Larguras em px viram proporções (fr), para o esqueleto caber em qualquer tela.
  const grade = colunas.map(c => `minmax(0, ${typeof c === 'number' ? `${c / 100}fr` : c.endsWith('%') ? `${parseFloat(c) / 10}fr` : c})`).join(' ');
  return (
    <div className="overflow-hidden" style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }} aria-hidden>
      <div className="grid gap-4 px-4 py-3 border-b" style={{ gridTemplateColumns: grade, borderColor: 'var(--rule)' }}>
        {colunas.map((_, i) => <Bloco key={i} w="60%" h={10} />)}
      </div>
      {Array.from({ length: linhas }, (_, l) => (
        <div
          key={l}
          className="grid gap-4 px-4 py-3.5 border-b items-center"
          style={{ gridTemplateColumns: grade, borderColor: 'var(--rule)' }}
        >
          {colunas.map((_, c) => <Bloco key={c} w={LARGURAS[(l + c) % LARGURAS.length]} h={13} />)}
        </div>
      ))}
    </div>
  );
}

export function EsqueletoPainelLista({ titulo = 180, itens = 4, className = '' }: { titulo?: number; itens?: number; className?: string }) {
  return (
    <div className={`panel ${className}`} aria-hidden>
      <div className="pb-3 mb-3 border-b" style={{ borderColor: 'var(--rule)' }}>
        <Bloco w={titulo} h={18} />
      </div>
      {Array.from({ length: itens }, (_, i) => (
        <div key={i} className="py-3 border-b grid gap-2" style={{ borderColor: 'var(--rule)' }}>
          <div className="flex justify-between gap-3">
            <Bloco w={LARGURAS[i % LARGURAS.length]} h={15} />
            <Bloco w={72} h={20} style={{ borderRadius: 10 }} />
          </div>
          <Bloco w="40%" h={11} />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoFormulario({ campos = 5 }: { campos?: number }) {
  return (
    <div className="panel" style={{ maxWidth: 720 }} aria-hidden>
      <Bloco w={240} h={20} className="mb-5" />
      <div className="grid gap-5">
        {Array.from({ length: campos }, (_, i) => (
          <div key={i} className="grid gap-2">
            <Bloco w={130} h={11} />
            <Bloco w="100%" h={36} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-6">
        <Bloco w={140} h={34} />
        <Bloco w={90} h={34} />
      </div>
    </div>
  );
}
