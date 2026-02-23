'use client';

import { useEffect, useState, useRef } from 'react';
import { checkDigitalWhitelist } from '@/app/actions';

interface UseDigitalWhitelistResult {
  isAuthorized: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useDigitalWhitelist(userId: string | null): UseDigitalWhitelistResult {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsAuthorized(false);
      setIsLoading(false);
      return;
    }

    if (checkedRef.current === userId) {
      return;
    }

    let cancelled = false;

    async function check() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await checkDigitalWhitelist(userId!);
        if (!cancelled) {
          setIsAuthorized(result.authorized);
          checkedRef.current = userId;
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Erro ao verificar permissão');
          setIsAuthorized(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { isAuthorized, isLoading, error };
}
