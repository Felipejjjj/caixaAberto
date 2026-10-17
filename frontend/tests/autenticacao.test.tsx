import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ProtectedRoute } from '../src/components/ProtectedRoute';
import { LoginPage } from '../src/pages/LoginPage';
import { autenticar, stubApi } from './helpers/api';

// A area protegida le as organizacoes do usuario antes de mostrar a pagina (US13).
const ORGANIZACAO_DO_USUARIO = {
  vinculoId: '12',
  papel: 'TESOUREIRO',
  dataVinculo: '2026-09-24',
  organizacao: {
    id: '2',
    nome: 'Comissão',
    descricao: 'Caixa da comissão',
    inicioGestao: '2026-01-01',
    fimGestao: '2026-12-31',
    linkPublico: null,
    transparenciaAtiva: false,
  },
};

function renderizarLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/lancamentos" element={<h1>Lançamentos</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderizarAreaProtegida() {
  return render(
    <MemoryRouter initialEntries={['/lancamentos']}>
      <Routes>
        <Route path="/login" element={<h1>Caixa Aberto</h1>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/lancamentos" element={<h1>Lançamentos</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

async function entrar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText(/E-mail/), 'ana@exemplo.com');
  await usuario.type(screen.getByLabelText(/Senha/), 'senha123456');
  await usuario.click(screen.getByRole('button', { name: /Entrar/ }));
}

describe('LoginPage', () => {
  it('guarda o token e leva para a área autenticada (CA-F01-02)', async () => {
    stubApi({ '/auth/login': { body: { token: 'token-novo', user: { id: '1' } } } });
    const usuario = userEvent.setup();
    renderizarLogin();

    await entrar(usuario);

    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    expect(localStorage.getItem('caixaAberto.token')).toBe('token-novo');
  });

  // CA-F01-03: a mensagem nao pode revelar se o e-mail existe. Dizer "senha incorreta" entregaria
  // que a conta existe, e a tela usa a mensagem que a API manda.
  it('mostra a mensagem da API sem indicar qual campo falhou (CA-F01-03)', async () => {
    stubApi({ '/auth/login': { status: 401, body: { erro: 'E-mail ou senha inválidos' } } });
    const usuario = userEvent.setup();
    renderizarLogin();

    await entrar(usuario);

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('E-mail ou senha inválidos');
    expect(alerta.textContent).not.toMatch(/senha incorreta|e-mail não encontrado/i);
    expect(localStorage.getItem('caixaAberto.token')).toBeNull();
  });

  it('descarta a sessão anterior antes de guardar a nova', async () => {
    localStorage.setItem('caixaAberto.token', 'token-antigo');
    localStorage.setItem('caixaAberto.organizationId', '99');

    stubApi({ '/auth/login': { body: { token: 'token-novo', user: { id: '1' } } } });
    const usuario = userEvent.setup();
    renderizarLogin();

    await entrar(usuario);

    await waitFor(() => expect(localStorage.getItem('caixaAberto.token')).toBe('token-novo'));
    expect(localStorage.getItem('caixaAberto.organizationId')).toBeNull();
  });
});

describe('ProtectedRoute', () => {
  it('manda para o login quem não tem sessão (CA-F01-04)', () => {
    stubApi({});
    renderizarAreaProtegida();

    expect(screen.getByRole('heading', { name: 'Caixa Aberto' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lançamentos' })).not.toBeInTheDocument();
  });

  it('deixa passar quem tem sessão', async () => {
    autenticar();
    stubApi({ '/users/me/organizacoes': { body: { dados: [ORGANIZACAO_DO_USUARIO] } } });
    renderizarAreaProtegida();

    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
  });

  it('encerra a sessão e volta ao login ao sair (CA-F01-04)', async () => {
    autenticar();
    stubApi({ '/auth/logout': { status: 204 } });
    const usuario = userEvent.setup();
    renderizarAreaProtegida();

    await usuario.click(screen.getByRole('button', { name: /Sair/ }));

    expect(await screen.findByRole('heading', { name: 'Caixa Aberto' })).toBeInTheDocument();
    expect(localStorage.getItem('caixaAberto.token')).toBeNull();
  });

  // A sessao local precisa cair mesmo com a API fora do ar. Sem isso o usuario continuaria com o
  // token no navegador depois de pedir para sair.
  it('encerra a sessão local mesmo se o logout na API falhar', async () => {
    autenticar();
    stubApi({ '/auth/logout': { status: 500, body: { erro: 'Erro interno do servidor' } } });
    const usuario = userEvent.setup();
    renderizarAreaProtegida();

    await usuario.click(screen.getByRole('button', { name: /Sair/ }));

    expect(await screen.findByRole('heading', { name: 'Caixa Aberto' })).toBeInTheDocument();
    expect(localStorage.getItem('caixaAberto.token')).toBeNull();
  });
});
