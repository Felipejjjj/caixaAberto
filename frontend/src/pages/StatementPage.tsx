import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { EstadoVazio } from '../components/ui/EstadoVazio';
import { SeletorData } from '../components/ui/SeletorData';
import { TabelaEsqueleto } from '../components/ui/TabelaEsqueleto';
import { TabelaRolavel } from '../components/ui/TabelaRolavel';
import { formatarData, formatarMoeda, rotuloTipo, valorComSinal } from '../lib/formato';
import { hojeISO, primeiroDiaDoMesAtual } from '../lib/data';
import { ApiError, apiRequest } from '../lib/httpClient';
import { useTituloPagina } from '../lib/useTituloPagina';

type TransactionType = 'ENTRADA' | 'SAIDA';

interface StatementLine {
  id: string;
  data: string;
  tipo: TransactionType;
  valor: string;
  categoria: { id: string; nome: string };
  descricao: string;
  status: 'ATIVO' | 'ESTORNADO';
  saldoAcumulado: string;
}

interface StatementResponse {
  dataInicio: string;
  dataFim: string;
  saldoAnterior: string;
  linhas: StatementLine[];
  saldoFinal: string;
}

const COLUNAS = 5;

export function StatementPage() {
  useTituloPagina('Extrato');

  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMesAtual());
  const [dataFim, setDataFim] = useState(hojeISO());
  const [periodoConsultado, setPeriodoConsultado] = useState({
    dataInicio: primeiroDiaDoMesAtual(),
    dataFim: hojeISO(),
  });
  const [extrato, setExtrato] = useState<StatementResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro(null);

      const params = new URLSearchParams({
        dataInicio: periodoConsultado.dataInicio,
        dataFim: periodoConsultado.dataFim,
      });

      try {
        const dados = await apiRequest<StatementResponse>(`/extrato?${params.toString()}`);
        if (!cancelado) setExtrato(dados);
      } catch (error) {
        if (!cancelado) {
          setErro(
            error instanceof ApiError ? error.message : 'Não foi possível carregar o extrato',
          );
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void carregar();

    return () => {
      cancelado = true;
    };
  }, [periodoConsultado]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPeriodoConsultado({ dataInicio, dataFim });
  }

  const semLinhas = Boolean(extrato && extrato.linhas.length === 0 && !carregando);

  return (
    <main data-largura="ampla">
      <div className="cabecalho-pagina">
        <div>
          <h1>Extrato</h1>
          <p className="cabecalho-pagina__apoio">
            Movimentações de {formatarData(periodoConsultado.dataInicio)} a{' '}
            {formatarData(periodoConsultado.dataFim)}, com saldo acumulado linha a linha.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <fieldset className="filtros">
          <legend>Período</legend>

          <div className="filtros__campos">
            <SeletorData rotulo="De" valor={dataInicio} aoSelecionar={setDataInicio} />

            <SeletorData rotulo="Até" valor={dataFim} aoSelecionar={setDataFim} />

            <button type="submit" data-variante="secundario">
              Consultar
            </button>
          </div>
        </fieldset>
      </form>

      {carregando && (
        <p role="status" className="apenas-leitor">
          Carregando extrato
        </p>
      )}
      {erro && <p role="alert">{erro}</p>}

      {extrato && (
        <>
          <section className="numeros" aria-label="Saldos do período">
            <div className="numeros__item">
              <span className="numeros__rotulo">Saldo anterior</span>
              <strong className="numeros__valor">{formatarMoeda(extrato.saldoAnterior)}</strong>
            </div>
            <div className="numeros__item numeros__item--saldo">
              <span className="numeros__rotulo">Saldo final</span>
              <strong className="numeros__valor">{formatarMoeda(extrato.saldoFinal)}</strong>
              <span className="numeros__apoio">
                {extrato.linhas.length}{' '}
                {extrato.linhas.length === 1 ? 'movimentação' : 'movimentações'} no período
              </span>
            </div>
          </section>

          {semLinhas && (
            <EstadoVazio
              titulo="Sem movimentações no período"
              descricao="O saldo não mudou entre as datas escolhidas. Escolha um intervalo maior para ver a trilha de lançamentos."
            />
          )}
        </>
      )}

      {(carregando || (extrato && extrato.linhas.length > 0)) && (
        <TabelaRolavel titulo="Extrato de movimentações" cartoes>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th data-alinha="direita">Valor</th>
                <th data-alinha="direita">Saldo acumulado</th>
              </tr>
            </thead>

            {carregando && <TabelaEsqueleto colunas={COLUNAS} />}

            {!carregando && extrato && (
              <tbody>
                {extrato.linhas.map((linha) => (
                  <tr
                    key={linha.id}
                    className={linha.status === 'ESTORNADO' ? 'linha--estornada' : undefined}
                  >
                    <td data-campo="data">{formatarData(linha.data)}</td>
                    <td data-coluna="texto" data-campo="descricao">
                      {linha.descricao}{' '}
                      {linha.status === 'ESTORNADO' && (
                        <span className="etiqueta etiqueta--estornado">Estornado</span>
                      )}
                    </td>
                    <td data-coluna="texto" data-campo="categoria">
                      {linha.categoria.nome}
                    </td>
                    <td data-alinha="direita" data-campo="valor">
                      <span
                        className={`valor valor--${linha.tipo.toLowerCase()}`}
                        aria-label={`${rotuloTipo(linha.tipo)} de ${formatarMoeda(linha.valor)}`}
                      >
                        {valorComSinal(linha.tipo, linha.valor)}
                      </span>
                    </td>
                    <td data-alinha="direita" data-campo="saldo" data-rotulo="Saldo">
                      {linha.status === 'ESTORNADO' ? '-' : formatarMoeda(linha.saldoAcumulado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </TabelaRolavel>
      )}
    </main>
  );
}
