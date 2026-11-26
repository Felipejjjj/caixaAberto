import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { GoalsPage } from '../src/pages/GoalsPage';
import { autenticar, stubApi } from './helpers/api';

const META_EM_ANDAMENTO = {
  id: '1',
  descricao: 'Festa de formatura',
  valorAlvo: '20000.00',
  prazo: '2999-12-31',
  valorArrecadado: '5000.00',
  percentual: 25,
  situacao: 'EM_ANDAMENTO',
  situacaoDescricao: 'Em andamento',
};

const META_ENCERRADA = {
  id: '2',
  descricao: 'Camisetas',
  valorAlvo: '1500.00',
  prazo: '2020-01-31',
  valorArrecadado: '300.00',
  percentual: 20,
  situacao: 'PRAZO_ENCERRADO',
  situacaoDescricao: 'Prazo encerrado',
};

function stubMetas(dados: unknown[] = [META_EM_ANDAMENTO, META_ENCERRADA]) {
  return stubApi({ '/metas': { body: { dados } } });
}

// US25 e US26: cadastro e alteracao de metas pela tesouraria.
describe('GoalsPage', () => {
  it('lista as metas com valor arrecadado, percentual e situação', async () => {
    autenticar('CONSULTOR');
    stubMetas();

    render(<GoalsPage />);

    const meta = (await screen.findByRole('heading', { name: 'Festa de formatura' })).closest(
      'article',
    )!;
    expect(within(meta).getByText('Em andamento')).toBeInTheDocument();
    expect(within(meta).getByText('25%')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Cadastrar meta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('cadastra uma meta com o valor normalizado', async () => {
    autenticar('TESOUREIRO');
    stubMetas([]);
    const usuario = userEvent.setup();

    render(<GoalsPage />);

    await usuario.type(await screen.findByLabelText('Descrição'), 'Viagem');
    await usuario.type(screen.getByLabelText('Valor-alvo (R$)'), '1234,50');
    await usuario.type(screen.getByLabelText('Prazo'), '2999-06-30');

    // O stub responde por trecho de URL: o POST e o GET que recarrega a lista caem na mesma rota.
    const api = stubApi({
      '/metas': {
        status: 201,
        body: {
          id: '3',
          descricao: 'Viagem',
          valorAlvo: '1234.50',
          prazo: '2999-06-30',
          dados: [],
        },
      },
    });
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Meta "Viagem" cadastrada.');
    const envio = api.chamadas.find((chamada) => chamada.method === 'POST')!;
    expect(envio.body).toEqual({ descricao: 'Viagem', valorAlvo: '1234.50', prazo: '2999-06-30' });
  });

  it('recusa no cadastro um prazo que já passou', async () => {
    autenticar('TESOUREIRO');
    const api = stubMetas([]);
    const usuario = userEvent.setup();

    render(<GoalsPage />);

    await usuario.type(await screen.findByLabelText('Descrição'), 'Viagem');
    await usuario.type(screen.getByLabelText('Valor-alvo (R$)'), '100');
    await usuario.type(screen.getByLabelText('Prazo'), '2020-01-01');
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(
      await screen.findByText('O prazo deve ser hoje ou uma data futura.'),
    ).toBeInTheDocument();
    expect(api.chamadas.filter((chamada) => chamada.method === 'POST')).toHaveLength(0);
  });

  it('altera só a descrição de uma meta com prazo encerrado', async () => {
    autenticar('TESOUREIRO');
    stubMetas();
    const usuario = userEvent.setup();

    render(<GoalsPage />);

    const meta = (await screen.findByRole('heading', { name: 'Camisetas' })).closest('article')!;
    await usuario.click(within(meta).getByRole('button', { name: 'Editar' }));

    const api = stubApi({
      '/metas/2': {
        body: {
          id: '2',
          descricao: 'Camisetas da turma',
          valorAlvo: '1500.00',
          prazo: '2020-01-31',
        },
      },
      '/metas': { body: { dados: [{ ...META_ENCERRADA, descricao: 'Camisetas da turma' }] } },
    });

    const descricao = screen.getByLabelText('Descrição');
    await usuario.clear(descricao);
    await usuario.type(descricao, 'Camisetas da turma');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Meta "Camisetas da turma" atualizada.',
    );
    const envio = api.chamadas.find((chamada) => chamada.method === 'PUT')!;
    expect(envio.url).toContain('/metas/2');
    expect(envio.body).toEqual({ descricao: 'Camisetas da turma' });
  });

  it('não chama a API quando a edição não muda nada', async () => {
    autenticar('TESOUREIRO');
    const api = stubMetas();
    const usuario = userEvent.setup();

    render(<GoalsPage />);

    const meta = (await screen.findByRole('heading', { name: 'Festa de formatura' })).closest(
      'article',
    )!;
    await usuario.click(within(meta).getByRole('button', { name: 'Editar' }));
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Nenhuma alteração para salvar.');
    expect(api.chamadas.filter((chamada) => chamada.method === 'PUT')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeInTheDocument();
  });
});
