import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CategoriesPage } from '../src/pages/CategoriesPage';
import { autenticar, stubApi } from './helpers/api';

const CATEGORIAS = {
  dados: [
    { id: '10', nome: 'Alimentação', tipo: 'SAIDA' },
    { id: '11', nome: 'Mensalidades', tipo: 'ENTRADA' },
  ],
};

describe('CategoriesPage', () => {
  it('lista as categorias ativas com nome e tipo', async () => {
    autenticar();
    stubApi({ '/categorias': { body: CATEGORIAS } });

    render(<CategoriesPage />);

    expect(await screen.findByText('Alimentação')).toBeInTheDocument();
    expect(screen.getByText('Mensalidades')).toBeInTheDocument();
    expect(screen.getAllByText('Saída').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Entrada').length).toBeGreaterThan(0);
  });

  it('mostra estado vazio quando não há categorias', async () => {
    autenticar();
    stubApi({ '/categorias': { body: { dados: [] } } });

    render(<CategoriesPage />);

    expect(await screen.findByText('Nenhuma categoria cadastrada')).toBeInTheDocument();
  });

  it('avisa quando a leitura das categorias falha', async () => {
    autenticar();
    stubApi({ '/categorias': { status: 500, body: { erro: 'Erro interno do servidor' } } });

    render(<CategoriesPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno do servidor');
  });

  it('esconde cadastro, edição e exclusão para CONSULTOR', async () => {
    autenticar('CONSULTOR');
    stubApi({ '/categorias': { body: CATEGORIAS } });

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  it('cadastra uma nova categoria (US14)', async () => {
    autenticar();
    stubApi({ '/categorias': { body: CATEGORIAS } });
    const usuario = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    stubApi({
      '/categorias': {
        body: { id: '12', nome: 'Transporte', descricao: '', tipo: 'SAIDA' },
      },
    });

    await usuario.type(screen.getByLabelText('Nome'), 'Transporte');
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Categoria "Transporte" cadastrada.',
    );
    expect(screen.getByText('Transporte')).toBeInTheDocument();
  });

  it('avisa quando o cadastro é recusado por nome duplicado', async () => {
    autenticar();
    stubApi({ '/categorias': { body: CATEGORIAS } });
    const usuario = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    stubApi({
      '/categorias': {
        status: 409,
        body: { erro: 'Já existe categoria com esse nome e tipo' },
      },
    });

    await usuario.type(screen.getByLabelText('Nome'), 'Alimentação');
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe categoria com esse nome e tipo',
    );
  });

  it('edita nome e tipo de uma categoria (US15)', async () => {
    autenticar();
    stubApi({ '/categorias': { body: CATEGORIAS } });
    const usuario = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    await usuario.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);

    const campoNome = screen.getByLabelText('Nome de Alimentação');
    await usuario.clear(campoNome);
    await usuario.type(campoNome, 'Mercado');

    const api = stubApi({
      '/categorias/10': {
        body: { id: '10', nome: 'Mercado', descricao: '', tipo: 'SAIDA' },
      },
    });

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Categoria "Mercado" atualizada.');
    expect(screen.getByText('Mercado')).toBeInTheDocument();
    expect(api.chamadasPara('/categorias/10')[0]!.method).toBe('PUT');
  });

  it('cancela a edição sem chamar a API', async () => {
    autenticar();
    const api = stubApi({ '/categorias': { body: CATEGORIAS } });
    const usuario = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    await usuario.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByText('Alimentação')).toBeInTheDocument();
    expect(api.chamadasPara('/categorias/10')).toHaveLength(0);
  });

  it('avisa quando a edição é recusada por troca de tipo com lançamentos', async () => {
    autenticar();
    stubApi({ '/categorias': { body: CATEGORIAS } });
    const usuario = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    await usuario.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);

    stubApi({
      '/categorias/10': {
        status: 409,
        body: { erro: 'Categoria já possui lançamentos, não é possível trocar o tipo' },
      },
    });

    await usuario.selectOptions(screen.getByLabelText('Tipo de Alimentação'), 'ENTRADA');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Categoria já possui lançamentos, não é possível trocar o tipo',
    );
  });

  it('exclui uma categoria com confirmação (US16)', async () => {
    autenticar();
    stubApi({ '/categorias': { body: CATEGORIAS } });
    const usuario = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    await usuario.click(screen.getAllByRole('button', { name: 'Excluir' })[0]!);
    expect(screen.getByText('Confirmar exclusão?')).toBeInTheDocument();

    const api = stubApi({ '/categorias/10': { status: 204 } });

    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Categoria "Alimentação" excluída.',
    );
    expect(screen.queryByText('Alimentação')).not.toBeInTheDocument();
    expect(api.chamadasPara('/categorias/10')[0]!.method).toBe('DELETE');
  });

  it('cancela a exclusão sem chamar a API', async () => {
    autenticar();
    const api = stubApi({ '/categorias': { body: CATEGORIAS } });
    const usuario = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    await usuario.click(screen.getAllByRole('button', { name: 'Excluir' })[0]!);
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByText('Alimentação')).toBeInTheDocument();
    expect(api.chamadasPara('/categorias/10')).toHaveLength(0);
  });

  it('avisa quando a exclusão falha', async () => {
    autenticar();
    stubApi({ '/categorias': { body: CATEGORIAS } });
    const usuario = userEvent.setup();

    render(<CategoriesPage />);

    await screen.findByText('Alimentação');

    await usuario.click(screen.getAllByRole('button', { name: 'Excluir' })[0]!);

    stubApi({
      '/categorias/10': { status: 404, body: { erro: 'Categoria não encontrada' } },
    });

    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Categoria não encontrada');
  });
});
