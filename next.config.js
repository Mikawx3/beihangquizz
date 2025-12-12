/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Résoudre les problèmes avec Firebase dans Next.js
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
  // Optimiser les imports Firebase
  experimental: {
    optimizePackageImports: ['firebase'],
  },
}

module.exports = nextConfig


