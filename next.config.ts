
import type {NextConfig} from 'next';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Determinar qual arquivo .env carregar baseado no NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'production' ? '.env.prod' : '.env.dev';
const envPath = path.resolve(process.cwd(), envFile);

// Log de debug
console.log('🔍 DEBUG next.config.ts:');
console.log('  - NODE_ENV:', nodeEnv);
console.log('  - Ambiente:', nodeEnv === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO');
console.log('  - Arquivo .env esperado:', envFile);
console.log('  - Caminho completo:', envPath);

// Verificar se o arquivo existe antes de carregar
const fileExists = fs.existsSync(envPath);
if (!fileExists) {
  console.warn(`⚠️  Arquivo ${envFile} não encontrado em: ${envPath}`);
  if (nodeEnv === 'production') {
    console.error('❌ ERRO: Arquivo .env.prod é obrigatório em produção!');
    throw new Error(`Arquivo .env.prod não encontrado. Necessário para deploy em produção.`);
  }
} else {
  console.log(`✅ Arquivo ${envFile} encontrado!`);
}

// Carregar o arquivo .env apropriado
const result = config({ path: envPath });

if (result.error) {
  console.error('❌ Erro ao carregar .env:', result.error);
  if (nodeEnv === 'production') {
    throw new Error(`Falha ao carregar .env.prod: ${result.error.message}`);
  }
} else {
  console.log('✅ Arquivo .env carregado com sucesso!');
  console.log('  - Variáveis carregadas:', Object.keys(result.parsed || {}).length);
  
  // Validação crítica: verificar variáveis obrigatórias em produção
  if (nodeEnv === 'production' && result.parsed) {
    const requiredVars = [
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_API_KEY',
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'
    ];
    
    const missingVars = requiredVars.filter(varName => !result.parsed![varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ ERRO: Variáveis obrigatórias faltando em .env.prod:');
      missingVars.forEach(v => console.error(`   - ${v}`));
      throw new Error(`Variáveis obrigatórias faltando em .env.prod: ${missingVars.join(', ')}`);
    }
    
    console.log('✅ Todas as variáveis obrigatórias estão presentes!');
    
    // Log de uma variável de teste (truncada por segurança)
    const testVar = result.parsed['NEXT_PUBLIC_FIREBASE_PROJECT_ID'];
    console.log('  - NEXT_PUBLIC_FIREBASE_PROJECT_ID:', testVar ? `${testVar.substring(0, 12)}...` : 'não encontrada');
    
    // Verificar se é realmente o projeto de produção
    if (testVar && testVar !== 'datavisor-44i5m') {
      console.warn(`⚠️  ATENÇÃO: Project ID não parece ser de produção (esperado: datavisor-44i5m, encontrado: ${testVar})`);
    }
  }
}

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
