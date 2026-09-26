import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { getCurrentUser } from '@/lib/session';
import { TEMA_PADRAO, atributoDoTema } from '@/lib/temas';

// Fontes baixadas no build e servidas pelo próprio site (next/font): sem
// pedido ao Google a cada acesso (nem envio do IP do servidor público para
// lá), com pré-carregamento e fonte reserva de mesma métrica, para o texto
// não "pular" quando a fonte chega. Usadas via var(--font-*) no CSS.
const fonteDisplay = Fraunces({ subsets: ['latin'], axes: ['opsz'], variable: '--font-display' });
const fonteSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const fonteMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Plano de Metas · Ubá',
  description: 'Gestão do Plano de Metas 2025–2028 da Prefeitura Municipal de Ubá'
};

// Tema de cores: o servidor já entrega o <html> com o data-theme do usuário
// logado (salvo no banco, escolhido em "Aparência" no menu) ou o padrão Azul
// Cubic — a página abre direto na cor certa, sem piscar. getCurrentUser() é
// memorizado por requisição: não gera consulta extra nas telas internas.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const tema = user?.tema ?? TEMA_PADRAO;

  return (
    <html
      lang="pt-BR"
      data-theme={atributoDoTema(tema)}
      className={`${fonteDisplay.variable} ${fonteSans.variable} ${fonteMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
