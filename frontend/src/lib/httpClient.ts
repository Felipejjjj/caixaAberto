import { clearSession, getOrganizationId, getToken } from './session';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

interface UploadOptions {
  method?: 'POST' | 'PUT' | 'PATCH';
  auth?: boolean;
}

async function extractError(response: Response): Promise<ApiError> {
  try {
    const data = await response.json();
    const message = data?.erro ?? data?.error ?? 'Erro inesperado';
    return new ApiError(response.status, message, data?.campos);
  } catch {
    return new ApiError(response.status, 'Erro inesperado');
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    const token = getToken();

    if (!token) {
      throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
    }

    headers.Authorization = `Bearer ${token}`;

    const organizationId = getOrganizationId();
    if (organizationId) headers['X-Organization-Id'] = organizationId;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    clearSession();
  }

  if (!response.ok) {
    throw await extractError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function apiUploadRequest<T>(
  path: string,
  formData: FormData,
  options: UploadOptions = {},
): Promise<T> {
  const { method = 'POST', auth = true } = options;
  const headers: Record<string, string> = {};

  if (auth) {
    const token = getToken();

    if (!token) {
      throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
    }

    headers.Authorization = `Bearer ${token}`;

    const organizationId = getOrganizationId();
    if (organizationId) headers['X-Organization-Id'] = organizationId;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: formData,
  });

  if (response.status === 401) {
    clearSession();
  }

  if (!response.ok) {
    throw await extractError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function apiBlobRequest(path: string): Promise<Blob> {
  const token = getToken();

  if (!token) {
    throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
  }

  const organizationId = getOrganizationId();
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(organizationId ? { 'X-Organization-Id': organizationId } : {}),
    },
  });

  if (response.status === 401) {
    clearSession();
  }

  if (!response.ok) {
    throw await extractError(response);
  }

  return response.blob();
}
