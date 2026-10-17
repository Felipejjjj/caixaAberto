import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { OrganizationProvider, useOrganizationContext } from '../contexts/OrganizationContext';
import { apiRequest } from '../lib/httpClient';
import { clearSession, isAuthenticated } from '../lib/session';
import { AppFooter, AppHeader } from './AppHeader';

function ProtectedArea() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    organizacoes,
    organizacaoId,
    carregando: carregandoOrganizacoes,
    erro: erroOrganizacoes,
    selecionarOrganizacao,
  } = useOrganizationContext();
  const [saindo, setSaindo] = useState(false);

  async function handleLogout() {
    setSaindo(true);

    try {
      await apiRequest<unknown>('/auth/logout', {
        method: 'POST',
      });
    } catch {
      // A sessão local deve ser encerrada mesmo se a API estiver indisponível.
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  }

  const acoes = (
    <button type="button" data-variante="quieto" onClick={handleLogout} disabled={saindo}>
      {saindo ? 'Saindo...' : 'Sair'}
    </button>
  );

  if (carregandoOrganizacoes) {
    return (
      <>
        <AppHeader acoes={acoes} />
        <main>
          <p role="status">Carregando organizações...</p>
        </main>
        <AppFooter />
      </>
    );
  }

  if (erroOrganizacoes) {
    return (
      <>
        <AppHeader acoes={acoes} />
        <main>
          <p role="alert">{erroOrganizacoes}</p>
        </main>
        <AppFooter />
      </>
    );
  }

  if (organizacoes.length === 0 && location.pathname !== '/organizacao/nova') {
    return <Navigate to="/organizacao/nova" replace />;
  }

  return (
    <>
      <AppHeader
        comNavegacao={organizacoes.length > 0}
        organizacoes={organizacoes}
        organizacaoId={organizacaoId}
        onSelecionarOrganizacao={selecionarOrganizacao}
        acoes={acoes}
      />

      <Outlet key={organizacaoId ?? 'sem-organizacao'} />

      <AppFooter />
    </>
  );
}

export function ProtectedRoute() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <OrganizationProvider>
      <ProtectedArea />
    </OrganizationProvider>
  );
}
