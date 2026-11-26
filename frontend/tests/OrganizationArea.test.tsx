import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { OrganizationArea } from '../src/components/OrganizationArea';
import { OrganizationProvider } from '../src/contexts/OrganizationContext';
import { autenticar, stubApi } from './helpers/api';

function vinculos(papel: 'TESOUREIRO' | 'CONSULTOR') {
  return {
    body: {
      dados: [
        {
          vinculoId: '1',
          papel,
          dataVinculo: '2026-01-01',
          organizacao: {
            id: '1',
            nome: 'Comissão de Formatura',
            descricao: '',
            inicioGestao: '2026-01-01',
            fimGestao: '2026-12-31',
            linkPublico: null,
            transparenciaAtiva: false,
          },
        },
      ],
    },
  };
}

function renderizar(endereco = '/organizacao') {
  return render(
    <MemoryRouter initialEntries={[endereco]}>
      <OrganizationProvider>
        <Routes>
          <Route path="/organizacao" element={<OrganizationArea />}>
            <Route index element={<Navigate to="membros" replace />} />
            <Route path="membros" element={<h1>Membros</h1>} />
            <Route path="categorias" element={<h1>Categorias</h1>} />
          </Route>
          <Route path="/organizacao/nova" element={<h1>Criar organização</h1>} />
        </Routes>
      </OrganizationProvider>
    </MemoryRouter>,
  );
}

describe('OrganizationArea', () => {
  it('abre em Membros e mostra a organização de trabalho', async () => {
    autenticar();
    stubApi({ '/users/me/organizacoes': vinculos('TESOUREIRO') });

    renderizar();

    expect(await screen.findByText('Comissão de Formatura')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Membros' })).toBeInTheDocument();
    const abas = screen.getByRole('navigation', { name: 'Seções da organização' });
    expect(within(abas).getByRole('link', { name: 'Membros' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('mostra as cinco seções para TESOUREIRO', async () => {
    autenticar('TESOUREIRO');
    stubApi({ '/users/me/organizacoes': vinculos('TESOUREIRO') });

    renderizar();

    const abas = await screen.findByRole('navigation', { name: 'Seções da organização' });
    expect(
      within(abas)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Membros', 'Categorias', 'Metas', 'Dados', 'Link público']);
  });

  it('esconde Dados e Link público de CONSULTOR', async () => {
    autenticar('CONSULTOR');
    stubApi({ '/users/me/organizacoes': vinculos('CONSULTOR') });

    renderizar();

    const abas = await screen.findByRole('navigation', { name: 'Seções da organização' });
    expect(
      within(abas)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Membros', 'Categorias', 'Metas']);
  });

  // US07: quem ja tem organizacao tambem cria outra, e passa a ser tesoureiro dela.
  it('leva ao cadastro de uma nova organização', async () => {
    autenticar('CONSULTOR');
    stubApi({ '/users/me/organizacoes': vinculos('CONSULTOR') });
    const usuario = userEvent.setup();

    renderizar('/organizacao/categorias');

    await usuario.click(await screen.findByRole('link', { name: 'Nova organização' }));

    expect(await screen.findByRole('heading', { name: 'Criar organização' })).toBeInTheDocument();
  });
});
