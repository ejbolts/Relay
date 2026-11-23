import { useQuery } from '@tanstack/react-query';
import type { AuthConfig, RegisterInput, User } from '../../../frontend/src/types';
import { apiOrigin, request } from '../data/api';

export function useRegistrationConfig(enabled: boolean) {
  return useQuery({
    queryKey: ['auth', 'registration'],
    queryFn: ({ signal }) => request<AuthConfig>('/api/auth/config', { signal }, null),
    enabled: enabled && !!apiOrigin,
    retry: false,
  });
}

export function registerAccount(fields: RegisterInput) {
  return request<User>(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    },
    null,
  );
}
