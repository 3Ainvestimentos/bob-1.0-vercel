import type {NextConfig} from 'next';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Variáveis críticas que indicam que estamos em produção (Firebase App Hosting)
const criticalProdVars = [
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'
];

// Detectar se estamos em produção baseado em:
// 1. NODE_ENV explícito
// 2. Presença de variáveis do Secret Manager (produção no Firebase App Hosting)
const hasSecretManagerVars = criticalProdVars.every(varName => !!process.env[varName]);
const explicitNodeEnv = process.env.NODE_ENV;

// Determinar o ambiente real
let nodeEnv: string;
if (explicitNodeEnv) {
  // Se NODE_ENV estiver definido explicitamente, usa ele
  nodeEnv = explicitNodeEnv;
} else if (hasSecretManagerVars) {
  // Se não estiver definido mas temos variáveis do Secret Manager = produção
  nodeEnv = 'production';
  console.log('🚀 Ambiente de produção detectado via Secret Manager');
} else {
  // Caso contrário = desenvolvimento
  nodeEnv = 'development';
}

const envFile = nodeEnv === 'production' ? '.env.prod' : '.env.dev';
const envPath = path.resolve(process.cwd(), envFile);

// Log de debug
console.log('🔍 DEBUG next.config.ts:');
console.log('  - NODE_ENV (explicito):', explicitNodeEnv || 'não definido');
console.log('  - NODE_ENV (detectado):', nodeEnv);
console.log('  - Ambiente:', nodeEnv === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO');
console.log('  - Variáveis do Secret Manager:', hasSecretManagerVars ? 'SIM' : 'NÃO');
console.log('  - Arquivo .env esperado:', envFile);

// Lógica de carregamento:
// - Em DEV: sempre tentar carregar .env.dev se existir
// - Em PROD: só carregar .env.prod se as variáveis do Secret Manager NÃO estiverem disponíveis
const shouldLoadEnvFile = nodeEnv === 'development' || !hasSecretManagerVars;

if (shouldLoadEnvFile) {
  // Verificar se o arquivo existe antes de carregar
  const fileExists = fs.existsSync(envPath);
  
  if (fileExists) {
    console.log(`✅ Arquivo ${envFile} encontrado! Carregando...`);
    console.log('  - Caminho completo:', envPath);
    
    // IMPORTANTE: usar { override: false } para NÃO sobrescrever variáveis já existentes
    // Isso garante que secrets do App Hosting tenham prioridade sobre .env
    const result = config({ 
      path: envPath,
      override: false // Não sobrescreve variáveis já existentes em process.env
    });

    if (result.error) {
      console.error('❌ Erro ao carregar .env:', result.error);
      if (nodeEnv === 'production' && !hasSecretManagerVars) {
        throw new Error(`Falha ao carregar .env.prod e variáveis do Secret Manager não encontradas: ${result.error.message}`);
      }
    } else {
      console.log('✅ Arquivo .env carregado com sucesso!');
      if (result.parsed) {
        console.log('  - Variáveis carregadas do arquivo:', Object.keys(result.parsed).length);
        
        // Validação: verificar variáveis obrigatórias
        if (nodeEnv === 'production' && !hasSecretManagerVars) {
          const requiredVars = [
            'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
            'NEXT_PUBLIC_FIREBASE_API_KEY',
            'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'
          ];
          
          const missingVars = requiredVars.filter(varName => !process.env[varName]);
          
          if (missingVars.length > 0) {
            console.error('❌ ERRO: Variáveis obrigatórias faltando:');
            missingVars.forEach(v => console.error(`   - ${v}`));
            throw new Error(`Variáveis obrigatórias faltando: ${missingVars.join(', ')}`);
          }
          
          console.log('✅ Todas as variáveis obrigatórias estão presentes!');
        }
      }
    }
  } else {
    if (nodeEnv === 'development') {
      console.warn(`⚠️  Arquivo ${envFile} não encontrado em: ${envPath}`);
      console.warn('⚠️  Continuando sem carregar .env (variáveis devem estar definidas no sistema)');
    } else {
      // Produção sem Secret Manager e sem arquivo .env
      if (!hasSecretManagerVars) {
        console.error('❌ ERRO: Nenhuma fonte de variáveis encontrada!');
        console.error('❌ Arquivo .env.prod não encontrado E variáveis do Secret Manager não disponíveis');
        throw new Error('Variáveis de ambiente não configuradas. Configure o Secret Manager ou crie .env.prod');
      }
    }
  }
} else {
  // Produção com Secret Manager: não carregar .env para evitar sobrescrever secrets
  console.log('🚀 Firebase App Hosting detectado (variáveis do Secret Manager disponíveis)');
  console.log('ℹ️  Pulando carregamento de .env.prod para preservar variáveis do Secret Manager');
  
  // Validação: garantir que as variáveis críticas estão disponíveis
  const missingVars = criticalProdVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('❌ ERRO: Variáveis críticas faltando do Secret Manager:');
    missingVars.forEach(v => console.error(`   - ${v}`));
    throw new Error(`Variáveis críticas faltando do Secret Manager: ${missingVars.join(', ')}`);
  }
  
  console.log('✅ Todas as variáveis críticas estão disponíveis via Secret Manager!');
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
