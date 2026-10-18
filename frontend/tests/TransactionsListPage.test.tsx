import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TransactionsListPage } from '../src/pages/TransactionsListPage';
import { hojeISO, mesAtual, primeiroDiaDoMesAtual } from '../src/lib/data';
import { formatarCompetencia, formatarData } from '../src/lib/formato';
import { autenticar, stubApi } from './helpers/api';
import { escolherDia } from './helpers/campos';

const LISTAGEM = {
  '/categorias': { body: { dados: [{ id: '1', nome: 'Mensalidade' }] } },
  '/lancamentos': {
    body: {
      dados: [
        {
          id: '11',
          data: '2026-09-05',
          descricao: 'Mensalidades do mês corrente',
          categoria: { id: '1', nome: 'Mensalidade' },
          valor: '1310.00',
          tipo: 'ENTRADA',
          status: 'ATIVO',
          possuiComprovante: true,
        },
        {
          id: '15',
          data: '2026-09-15',
          descricao: 'Compra cancelada',
          categoria: { id: '4', nome: 'Material' },
          valor: '150.00',
          tipo: 'SAIDA',
          status: 'ESTORNADO',
          possuiComprovante: false,
        },
      ],
      paginacao: { pagina: 1, tamanhoPagina: 20, total: 2, totalPaginas: 1 },
    },
  },
};

function renderizar() {
  return render(
    <MemoryRouter>
      <TransactionsListPage />
    </MemoryRouter>,
  );
}

describe('TransactionsListPage', () => {
  it('formata data e valor, e mantém o tipo no nome acessível', async () => {
    autenticar();
    stubApi(LISTAGEM);

    renderizar();

    const tabela = await screen.findByRole('region', { name: 'Lançamentos' });

    expect(within(tabela).getByText('05/09/2026')).toBeInTheDocument();
    expect(within(tabela).getByLabelText(/Entrada de R\$\s*1\.310,00/)).toHaveTextContent(
      /\+R\$\s*1\.310,00/,
    );
    expect(within(tabela).getByLabelText(/Saída de R\$\s*150,00/)).toHaveTextContent(
      /-R\$\s*150,00/,
    );
  });

  // Sim e Nao viraram marcador, com o texto ficando so para leitor de tela.
  it('indica a presença de comprovante de forma acessível', async () => {
    autenticar();
    stubApi(LISTAGEM);

    renderizar();

    const tabela = await screen.findByRole('region', { name: 'Lançamentos' });

    expect(within(tabela).getByText('Possui comprovante')).toBeInTheDocument();
    expect(within(tabela).getByText('Sem comprovante')).toBeInTheDocument();
  });

  it('dá nome acessível completo ao link de detalhe', async () => {
    autenticar();
    stubApi(LISTAGEM);

    renderizar();

    expect(
      await screen.findByRole('link', { name: 'Ver detalhes de Mensalidades do mês corrente' }),
    ).toHaveAttribute('href', '/lancamentos/11');
  });

  it('marca a linha estornada', async () => {
    autenticar();
    stubApi(LISTAGEM);

    renderizar();

    const tabela = await screen.findByRole('region', { name: 'Lançamentos' });
    const linha = within(tabela).getByText('Compra cancelada').closest('tr');

    expect(linha).toHaveClass('linha--estornada');
  });

  it('informa o total de lançamentos do período', async () => {
    autenticar();
    stubApi(LISTAGEM);

    renderizar();

    expect(await screen.findByText('2 lançamentos no período')).toBeInTheDocument();
  });

  // A tela abre no mes corrente, como o Extrato e o Relatorio, em vez de despejar o
  // historico inteiro de uma vez.
  it('abre consultando o mês corrente', async () => {
    autenticar();
    const api = stubApi(LISTAGEM);

    renderizar();

    await screen.findByText('2 lançamentos no período');

    const consulta = api.chamadasPara('/lancamentos').at(-1)!.url;

    expect(consulta).toContain(`dataInicio=${primeiroDiaDoMesAtual()}`);
    expect(consulta).toContain(`dataFim=${hojeISO()}`);
  });

  const SEM_RESULTADO = {
    ...LISTAGEM,
    '/lancamentos': {
      body: {
        dados: [],
        paginacao: { pagina: 1, tamanhoPagina: 20, total: 0, totalPaginas: 0 },
      },
    },
  };

  // Tres vazios diferentes, e cada um leva a uma saida diferente.
  it('distingue o mês sem movimento do caixa vazio', async () => {
    autenticar();
    const api = stubApi(SEM_RESULTADO);
    const usuario = userEvent.setup();

    renderizar();

    const mes = formatarCompetencia(mesAtual());

    expect(await screen.findByText(`Nenhum lançamento em ${mes}`)).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Ver todo o histórico' }));

    // Sem periodo nenhum e ainda sem resultado: aí sim o caixa nunca teve lançamento.
    expect(await screen.findByText('O caixa ainda está vazio')).toBeInTheDocument();

    const consulta = api.chamadasPara('/lancamentos').at(-1)!.url;

    expect(consulta).not.toContain('dataInicio=');
    expect(consulta).not.toContain('dataFim=');
  });

  it('oferece limpar os filtros quando o recorte do usuário não retorna nada', async () => {
    autenticar();
    stubApi(SEM_RESULTADO);
    const usuario = userEvent.setup();

    renderizar();

    await screen.findByText(`Nenhum lançamento em ${formatarCompetencia(mesAtual())}`);

    // Dia 2, e nao 1: o dia 1 e o inicio padrao, e o recorte continuaria sendo o do mes.
    await escolherDia(usuario, 'De', 2);
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));

    expect(await screen.findByText('Nenhum lançamento no período')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();
  });

  // No celular os campos ficam recolhidos; o resumo e o que diz qual recorte esta valendo.
  it('resume os filtros em uso e abre os campos pelo botão Alterar', async () => {
    autenticar();
    stubApi(LISTAGEM);
    const usuario = userEvent.setup();

    renderizar();

    const periodo = `${formatarData(primeiroDiaDoMesAtual())} a ${formatarData(hojeISO())}`;
    expect(await screen.findByText(periodo)).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Mensalidade' });

    await usuario.selectOptions(screen.getByLabelText('Tipo'), 'ENTRADA');
    await usuario.selectOptions(screen.getByLabelText('Categoria'), '1');

    expect(screen.getByText(`${periodo} · entradas · Mensalidade`)).toBeInTheDocument();

    const alterar = screen.getByRole('button', { name: 'Alterar' });
    expect(alterar).toHaveAttribute('aria-expanded', 'false');

    await usuario.click(alterar);

    expect(screen.getByRole('button', { name: 'Ocultar' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('mostra o erro da API quando a listagem não carrega', async () => {
    autenticar();
    stubApi({
      '/categorias': { body: { dados: [] } },
      '/lancamentos': { status: 500, body: { erro: 'Erro interno do servidor' } },
    });

    renderizar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno do servidor');
  });
});
