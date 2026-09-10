/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Видео и постеры — статика, кладём иммутабельный кэш на год.
  async headers() {
    return [
      {
        source: '/clips/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
