import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CategorySelect } from '../src/components/CategorySelect';
import { autenticar, stubApi } from './helpers/api';

function renderizar(tipo: 'ENTRADA' | 'SAIDA' = 'ENTRADA') {
  return render(<CategorySelect tipo={tipo} value="" onChange={() => {}} />);
}

describe('CategorySelect', () => {
  beforeEach(() => {
    autenticar();
  });

  it('pede as categorias do tipo do formulário, e não todas', async () => {
    const api = stubApi({ '/categorias': { body: { dados: [] } } });
    renderizar('SAIDA');

    await screen.findByRole('option', { name: 'Nenhuma categoria disponível' });

    expect(api.chamadasPara('/categorias')[0]!.url).toContain('tipo=SAIDA');
  });

  it('lista as categorias recebidas com nome e tipo', async () => {
    stubApi({
      '/categorias': {
        body: {
          dados: [
            { id: '1', nome: 'Mensalidade', tipo: 'ENTRADA' },
            { id: '2', nome: 'Rifa', tipo: 'ENTRADA' },
          ],
        },
      },
    });
    renderizar();

    expect(
      await screen.findByRole('option', { name: 'Mensalidade (Entrada)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rifa (Entrada)' })).toBeInTheDocument();
  });

  it('avisa quando a organização não tem categoria do tipo', async () => {
    stubApi({ '/categorias': { body: { dados: [] } } });
    renderizar();

    expect(
      await screen.findByRole('option', { name: 'Nenhuma categoria disponível' }),
    ).toBeInTheDocument();
  });

  // Uma falha ao carregar nao pode deixar o select em "Carregando..." para sempre, nem passar
  // despercebida: o formulario inteiro depende dessa lista para o lancamento ser valido.
  it('mostra o erro da API quando a lista não carrega', async () => {
    stubApi({ '/categorias': { status: 500, body: { erro: 'Erro interno do servidor' } } });
    renderizar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno do servidor');
  });

  it('desabilita o select enquanto carrega', () => {
    stubApi({ '/categorias': { body: { dados: [] } } });
    renderizar();

    expect(screen.getByLabelText(/Categoria/)).toBeDisabled();
  });

  // Na correcao de lancamento a categoria gravada pode ter sido excluida, e so ativas vem da API.
  it('mantém como opção a categoria atual excluída, marcada como tal', async () => {
    stubApi({
      '/categorias': { body: { dados: [{ id: '1', nome: 'Mensalidade', tipo: 'ENTRADA' }] } },
    });
    render(
      <CategorySelect
        tipo="ENTRADA"
        value="9"
        categoriaAtual={{ id: '9', nome: 'Rifa' }}
        onChange={() => {}}
      />,
    );

    expect(await screen.findByRole('option', { name: 'Rifa (excluída)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toHaveValue('9');
  });

  it('não repete a categoria atual quando ela ainda está ativa', async () => {
    stubApi({
      '/categorias': { body: { dados: [{ id: '1', nome: 'Mensalidade', tipo: 'ENTRADA' }] } },
    });
    render(
      <CategorySelect
        tipo="ENTRADA"
        value="1"
        categoriaAtual={{ id: '1', nome: 'Mensalidade' }}
        onChange={() => {}}
      />,
    );

    await screen.findByRole('option', { name: 'Mensalidade (Entrada)' });
    expect(screen.queryByRole('option', { name: /excluída/ })).not.toBeInTheDocument();
  });
});
