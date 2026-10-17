import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError, apiRequest } from '../lib/httpClient';
import type { OrganizacaoDoUsuario, OrganizacoesDoUsuarioResponse } from '../lib/organizacoes';
import { getOrganizationId, setOrganizationId, setPapel } from '../lib/session';

interface OrganizationContextValue {
  organizacoes: OrganizacaoDoUsuario[];
  organizacaoSelecionada: OrganizacaoDoUsuario | null;
  organizacaoId: string | null;
  carregando: boolean;
  erro: string | null;
  selecionarOrganizacao: (organizacaoId: string) => void;
  atualizarOrganizacoes: (organizacaoPreferidaId?: string) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

function aplicarSelecao(
  organizacoes: OrganizacaoDoUsuario[],
  organizacaoPreferidaId?: string,
): OrganizacaoDoUsuario | null {
  const idPersistido = getOrganizationId();
  const escolhida =
    organizacoes.find((item) => item.organizacao.id === organizacaoPreferidaId) ??
    organizacoes.find((item) => item.organizacao.id === idPersistido) ??
    organizacoes[0] ??
    null;

  if (escolhida) {
    setOrganizationId(escolhida.organizacao.id);
    setPapel(escolhida.papel);
  }

  return escolhida;
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organizacoes, setOrganizacoes] = useState<OrganizacaoDoUsuario[]>([]);
  const [organizacaoSelecionada, setOrganizacaoSelecionada] =
    useState<OrganizacaoDoUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const atualizarOrganizacoes = useCallback(async (organizacaoPreferidaId?: string) => {
    setCarregando(true);
    setErro(null);

    try {
      const resposta = await apiRequest<OrganizacoesDoUsuarioResponse>('/users/me/organizacoes');
      const atualizadas = resposta.dados;
      const escolhida = aplicarSelecao(atualizadas, organizacaoPreferidaId);

      if (!escolhida) {
        localStorage.removeItem('caixaAberto.organizationId');
        localStorage.removeItem('caixaAberto.papel');
      }

      setOrganizacoes(atualizadas);
      setOrganizacaoSelecionada(escolhida);
    } catch (error) {
      setErro(
        error instanceof ApiError ? error.message : 'Não foi possível carregar as organizações',
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void atualizarOrganizacoes();
  }, [atualizarOrganizacoes]);

  const selecionarOrganizacao = useCallback((id: string) => {
    const escolhida = organizacoes.find((item) => item.organizacao.id === id);
    if (!escolhida) return;

    setOrganizationId(id);
    setPapel(escolhida.papel);
    setOrganizacaoSelecionada(escolhida);
  }, [organizacoes]);

  const value = useMemo(
    () => ({
      organizacoes,
      organizacaoSelecionada,
      organizacaoId: organizacaoSelecionada?.organizacao.id ?? null,
      carregando,
      erro,
      selecionarOrganizacao,
      atualizarOrganizacoes,
    }),
    [
      organizacoes,
      organizacaoSelecionada,
      carregando,
      erro,
      selecionarOrganizacao,
      atualizarOrganizacoes,
    ],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganizationContext(): OrganizationContextValue {
  const context = useContext(OrganizationContext);

  if (!context) {
    throw new Error('useOrganizationContext deve ser usado dentro de OrganizationProvider');
  }

  return context;
}
