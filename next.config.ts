
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    allowedDevOrigins: [
        "6000-firebase-studio-1749227479654.cluster-qhrn7lb3szcfcud6uanedbkjnm.cloudworkstations.dev",
        "9000-firebase-studio-1749227479654.cluster-qhrn7lb3szcfcud6uanedbkjnm.cloudworkstations.dev"
    ],
    serverActions: {
      bodySizeLimit: '4.5mb',
      // Extend the timeout for server actions to 120 seconds for batch processing
      serverActions: {
        bodySizeLimit: '4.5mb',
        // Extend the timeout to 120s for batch processing
        timeout: 120,
      }
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'clipboard-write=*',
          },
        ],
      },
    ];
  },
  serverExternalPackages: [
    'pdf-parse',
    '@ffmpeg-installer/ffmpeg',
    '@ffprobe-installer/ffprobe',
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
