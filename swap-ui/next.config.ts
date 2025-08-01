import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disable to prevent duplicate useEffect calls in development
  /* config options here */
  // Tắt X-Powered-By header để bảo mật
  poweredByHeader: false,

  // Trailing slash for consistent URLs
  trailingSlash: true,

  // Image optimization configuration
  images: {
    domains: [
      'raw.githubusercontent.com', // GitHub raw content
      'assets.coingecko.com',     // CoinGecko logos
      'logos.covalenthq.com',     // Covalent logos
      'cryptologos.cc',           // Crypto logos
      'chainlist.org',            // Chain logos
    ],
  },

  // Remove console.log in production builds only
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
};

export default nextConfig;
