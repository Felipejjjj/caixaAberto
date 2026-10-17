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

async function buscarOrganizacoes(organizacaoPreferidaId?: string) {
  const resposta = await apiRequest<OrganizacoesDoUsuarioResponse>('/users/me/organizacoes');
  const atualizadas = resposta.dados;
  const escolhida = aplicarSelecao(atualizadas, organizacaoPreferidaId);

  if (!escolhida) {
    localStorage.removeItem('caixaAberto.organizationId');
    localStorage.removeItem('caixaAberto.papel');
  }

  return { atualizadas, escolhida };
}

function mensagemDeErro(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Não foi possível carregar as organizações';
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organizacoes, setOrganizacoes] = useState<OrganizacaoDoUsuario[]>([]);
  const [organizacaoSelecionada, setOrganizacaoSelecionada] = useState<OrganizacaoDoUsuario | null>(
    null,
  );
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // O carregando so vale para a primeira leitura. Depois de salvar uma organizacao a lista e
  // relida sem voltar a ele, para a area protegida nao desmontar o formulario no meio do envio.
  const atualizarOrganizacoes = useCallback(async (organizacaoPreferidaId?: string) => {
    try {
      const { atualizadas, escolhida } = await buscarOrganizacoes(organizacaoPreferidaId);
      setOrganizacoes(atualizadas);
      setOrganizacaoSelecionada(escolhida);
      setErro(null);
    } catch (error) {
      setErro(mensagemDeErro(error));
    }
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      try {
        const { atualizadas, escolhida } = await buscarOrganizacoes();
        if (cancelado) return;
        setOrganizacoes(atualizadas);
        setOrganizacaoSelecionada(escolhida);
      } catch (error) {
        if (!cancelado) setErro(mensagemDeErro(error));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void carregar();

    return () => {
      cancelado = true;
    };
  }, []);

  const selecionarOrganizacao = useCallback(
    (id: string) => {
      const escolhida = organizacoes.find((item) => item.organizacao.id === id);
      if (!escolhida) return;

      setOrganizationId(id);
      setPapel(escolhida.papel);
      setOrganizacaoSelecionada(escolhida);
    },
    [organizacoes],
  );

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
