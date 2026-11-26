import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MembersPage } from '../src/pages/MembersPage';
import { autenticar, stubApi } from './helpers/api';

const ORGANIZACOES_DO_USUARIO = {
  dados: [
    {
      vinculoId: '15',
      papel: 'TESOUREIRO',
      dataVinculo: '2026-10-14',
      organizacao: { id: '2' },
    },
  ],
};

const MEMBROS = {
  dados: [
    {
      id: '12',
      usuario: { id: '5', nome: 'Maria', email: 'maria@grupo.org', ativo: true },
      papel: 'CONSULTOR',
      dataVinculo: '2026-09-24',
      ativo: true,
    },
  ],
};

// A tela tem o link para cadastrar usuario (US03), entao precisa de um router em volta.
function renderizar() {
  return render(
    <MemoryRouter>
      <MembersPage />
    </MemoryRouter>,
  );
}

// US12: consultar membros ativos e papeis.
describe('MembersPage', () => {
  it('lista os membros ativos da organização com papel e data do vínculo (US12)', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: MEMBROS },
    });

    renderizar();

    const tabela = await screen.findByRole('region', { name: 'Membros da organização' });
    expect(within(tabela).getByText('Maria')).toBeInTheDocument();
    expect(within(tabela).getByText('maria@grupo.org')).toBeInTheDocument();
    expect(within(tabela).getByText('24/09/2026')).toBeInTheDocument();
  });

  it('mostra estado vazio quando a organização não tem membros', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: { dados: [] } },
    });

    renderizar();

    expect(await screen.findByText('Nenhum membro vinculado')).toBeInTheDocument();
  });

  it('avisa quando a leitura dos membros falha', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { status: 500, body: { erro: 'Erro interno do servidor' } },
    });

    renderizar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno do servidor');
  });

  it('esconde o vínculo de membro e a troca de papel para CONSULTOR', async () => {
    autenticar('CONSULTOR');
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: MEMBROS },
    });

    renderizar();

    await screen.findByText('Maria');

    expect(screen.queryByLabelText('E-mail do usuário')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Papel de Maria')).not.toBeInTheDocument();
    expect(screen.getByText('Consultor')).toBeInTheDocument();
  });

  it('vincula um usuário pelo e-mail e exibe o novo membro (US09)', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: MEMBROS },
    });
    const usuario = userEvent.setup();

    renderizar();

    await screen.findByText('Maria');

    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': {
        body: {
          id: '13',
          usuario: { id: '6', nome: 'Bruno', email: 'bruno@grupo.org' },
          papel: 'CONSULTOR',
          dataVinculo: '2026-10-16',
          ativo: true,
        },
      },
    });

    await usuario.type(screen.getByLabelText('E-mail do usuário'), 'bruno@grupo.org');
    await usuario.click(screen.getByRole('button', { name: 'Vincular' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Bruno foi vinculado à organização.',
    );
    expect(screen.getByText('bruno@grupo.org')).toBeInTheDocument();
  });

  it('avisa quando o e-mail já pertence a um membro ativo', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: MEMBROS },
    });
    const usuario = userEvent.setup();

    renderizar();

    await screen.findByText('Maria');

    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': {
        status: 409,
        body: { erro: 'Usuário já é membro ativo da organização' },
      },
    });

    await usuario.type(screen.getByLabelText('E-mail do usuário'), 'maria@grupo.org');
    await usuario.click(screen.getByRole('button', { name: 'Vincular' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usuário já é membro ativo da organização',
    );
  });

  it('altera o papel do membro selecionado (US10)', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: MEMBROS },
    });
    const usuario = userEvent.setup();

    renderizar();

    await screen.findByText('Maria');

    const api = stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/membros/12/papel': {
        body: {
          id: '12',
          usuario: { id: '5', nome: 'Maria', email: 'maria@grupo.org' },
          papel: 'TESOUREIRO',
          dataVinculo: '2026-09-24',
          ativo: true,
        },
      },
    });

    await usuario.selectOptions(screen.getByLabelText('Papel de Maria'), 'TESOUREIRO');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Papel de Maria alterado para Tesoureiro.',
    );
    expect(api.chamadasPara('/membros/12/papel')[0]!.method).toBe('PUT');
    expect(api.chamadasPara('/membros/12/papel')[0]!.body).toEqual({ papel: 'TESOUREIRO' });
  });

  it('mostra o próprio papel sem a troca, que é feita por outro tesoureiro', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': {
        body: {
          dados: [
            {
              id: '15',
              usuario: { id: '1', nome: 'Ana', email: 'ana@grupo.org' },
              papel: 'TESOUREIRO',
              dataVinculo: '2026-01-01',
              ativo: true,
            },
            ...MEMBROS.dados,
          ],
        },
      },
    });

    renderizar();

    const linhaDaAna = (await screen.findByText('Ana')).closest('tr')!;
    expect(within(linhaDaAna).getByText('(você)')).toBeInTheDocument();
    expect(within(linhaDaAna).getByText('Tesoureiro')).toBeInTheDocument();
    expect(screen.queryByLabelText('Papel de Ana')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Papel de Maria')).toBeInTheDocument();
  });

  it('avisa quando tenta rebaixar o último tesoureiro', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: MEMBROS },
    });
    const usuario = userEvent.setup();

    renderizar();

    await screen.findByText('Maria');

    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/membros/12/papel': {
        status: 409,
        body: { erro: 'Não é possível rebaixar o último tesoureiro ativo' },
      },
    });

    await usuario.selectOptions(screen.getByLabelText('Papel de Maria'), 'TESOUREIRO');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não é possível rebaixar o último tesoureiro ativo',
    );
  });

  // US05: a conta inativada continua vinculada, entao a linha fica na lista marcada como inativa.
  it('inativa a conta após a confirmação e mantém o membro marcado como inativo', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: MEMBROS },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const usuario = userEvent.setup();

    renderizar();

    await screen.findByText('Maria');

    const api = stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/users/5': { body: { id: '5', active: false } },
    });

    await usuario.click(screen.getByRole('button', { name: 'Inativar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Maria foi inativado.');
    expect(api.chamadasPara('/users/5')[0]!.method).toBe('DELETE');
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getByText('(conta inativa)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inativar' })).not.toBeInTheDocument();
  });

  it('não inativa quando a confirmação é cancelada', async () => {
    autenticar();
    const api = stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': { body: MEMBROS },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const usuario = userEvent.setup();

    renderizar();

    await usuario.click(await screen.findByRole('button', { name: 'Inativar' }));

    expect(api.chamadasPara('/users/5')).toHaveLength(0);
    expect(screen.queryByText('(conta inativa)')).not.toBeInTheDocument();
  });

  it('mostra a conta já inativa sem a ação de inativar', async () => {
    autenticar();
    stubApi({
      '/users/me/organizacoes': { body: ORGANIZACOES_DO_USUARIO },
      '/organizacoes/2/membros': {
        body: {
          dados: [{ ...MEMBROS.dados[0], usuario: { ...MEMBROS.dados[0]!.usuario, ativo: false } }],
        },
      },
    });

    renderizar();

    expect(await screen.findByText('(conta inativa)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inativar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar' })).toBeInTheDocument();
  });
});
