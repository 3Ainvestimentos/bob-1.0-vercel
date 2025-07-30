import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    allowedDevOrigins: ["6000-firebase-studio-1749227479654.cluster-qhrn7lb3szcfcud6uanedbkjnm.cloudworkstations.dev"]
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
