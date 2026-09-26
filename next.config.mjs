/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' }
  },
  async headers() {
    return [
      {
        // Logos quase nunca mudam: o navegador reaproveita por 7 dias em vez
        // de perguntar ao servidor a cada tela. (Trocar a logo = arquivo com
        // nome novo.)
        source: '/logo/:arquivo*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }]
      }
    ];
  }
};

export default nextConfig;
