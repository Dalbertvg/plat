import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Plano de Metas · Ubá',
  description: 'Gestão do Plano de Metas 2025–2028 da Prefeitura Municipal de Ubá'
};

// Aplica o tema salvo (data-theme) ANTES da hidratação para evitar flash —
// crucial em qualquer reload de página inteira (form sem client-side nav,
// F5, abrir link direto), não só na troca ao vivo pelo LayoutPicker.
// Silencioso quando localStorage é bloqueado (janela privada, iframe etc).
const applyStoredLayout = `
(function(){try{
  var v = localStorage.getItem('app.layout');
  if (v === 'azul' || v === 'turquesa' || v === 'petroleo' || v === 'marrom') {
    document.documentElement.setAttribute('data-theme', v);
  }
} catch(e){} })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredLayout }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
