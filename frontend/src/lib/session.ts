const TOKEN_KEY = 'caixaAberto.token';
const ORGANIZATION_ID_KEY = 'caixaAberto.organizationId';
const PAPEL_KEY = 'caixaAberto.papel';

export type Papel = 'TESOUREIRO' | 'CONSULTOR';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getOrganizationId(): string | null {
  return localStorage.getItem(ORGANIZATION_ID_KEY);
}

export function setOrganizationId(organizationId: string): void {
  localStorage.setItem(ORGANIZATION_ID_KEY, organizationId);
}

export function getPapel(): Papel | null {
  const papel = localStorage.getItem(PAPEL_KEY);

  return papel === 'TESOUREIRO' || papel === 'CONSULTOR' ? papel : null;
}

export function setPapel(papel: Papel): void {
  localStorage.setItem(PAPEL_KEY, papel);
}

// Quem so consulta nao ve as acoes de escrita. A permissao de verdade e do servidor;
// isto existe para nao oferecer um caminho que a API vai recusar com 403.
export function podeEscrever(): boolean {
  return getPapel() === 'TESOUREIRO';
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ORGANIZATION_ID_KEY);
  localStorage.removeItem(PAPEL_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
