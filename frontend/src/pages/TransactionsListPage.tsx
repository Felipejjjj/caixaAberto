import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { EstadoVazio } from '../components/ui/EstadoVazio';
import { IconeComprovante } from '../components/ui/IconeComprovante';
import { SeletorData } from '../components/ui/SeletorData';
import { TabelaEsqueleto } from '../components/ui/TabelaEsqueleto';
import { TabelaRolavel } from '../components/ui/TabelaRolavel';
import { hojeISO, primeiroDiaDoMesAtual } from '../lib/data';
import {
  formatarCompetencia,
  formatarData,
  formatarMoeda,
  rotuloTipo,
  valorComSinal,
} from '../lib/formato';
import { ApiError, apiRequest } from '../lib/httpClient';
import { podeEscrever } from '../lib/session';
import { useTituloPagina } from '../lib/useTituloPagina';

type TransactionType = 'ENTRADA' | 'SAIDA';

interface TransactionListItem {
  id: string;
  data: string;
  descricao: string;
  categoria: { id: string; nome: string };
  valor: string;
  tipo: TransactionType;
  status: 'ATIVO' | 'ESTORNADO';
  possuiComprovante: boolean;
}

interface TransactionListResponse {
  dados: TransactionListItem[];
  paginacao: { pagina: number; tamanhoPagina: number; total: number; totalPaginas: number };
}

interface CategoryOption {
  id: string;
  nome: string;
}

interface CategoryListResponse {
  dados: CategoryOption[];
}

interface Filtros {
  dataInicio: string;
  dataFim: string;
  tipo: '' | TransactionType;
  categoriaId: string;
}

// Sem periodo nenhum: e o que o botao de limpar devolve, para a trilha completa
// aparecer quando alguem procura um lancamento antigo.
const SEM_FILTROS: Filtros = {
  dataInicio: '',
  dataFim: '',
  tipo: '',
  categoriaId: '',
};

// A tela abre no mes corrente, como o Extrato e o Relatorio, em vez de despejar o
// historico inteiro. E funcao, e nao constante, porque o mes vira enquanto a aplicacao
// pode estar aberta.
function filtrosIniciais(): Filtros {
  return { ...SEM_FILTROS, dataInicio: primeiroDiaDoMesAtual(), dataFim: hojeISO() };
}

function ehPeriodoPadrao(filtros: Filtros): boolean {
  const padrao = filtrosIniciais();

  return (
    filtros.dataInicio === padrao.dataInicio &&
    filtros.dataFim === padrao.dataFim &&
    !filtros.tipo &&
    !filtros.categoriaId
  );
}

const COLUNAS = 6;

function montarQueryString(filtros: Filtros, pagina: number): string {
  const params = new URLSearchParams();

  if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
  if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.categoriaId) params.set('categoriaId', filtros.categoriaId);
  params.set('pagina', String(pagina));

  return params.toString();
}

// No celular os filtros ficam recolhidos e esta frase diz o recorte em uso.
function resumirFiltros(filtros: Filtros, categorias: CategoryOption[]): string {
  const { dataInicio, dataFim } = filtros;
  const periodo =
    dataInicio && dataFim
      ? `${formatarData(dataInicio)} a ${formatarData(dataFim)}`
      : dataInicio
        ? `A partir de ${formatarData(dataInicio)}`
        : dataFim
          ? `Até ${formatarData(dataFim)}`
          : 'Todo o período';
  const tipo = filtros.tipo === 'ENTRADA' ? 'entradas' : filtros.tipo === 'SAIDA' ? 'saídas' : '';
  const categoria = categorias.find((item) => item.id === filtros.categoriaId)?.nome ?? '';

  return [periodo, tipo, categoria].filter(Boolean).join(' · ');
}

function temFiltroAplicado(filtros: Filtros): boolean {
  return Boolean(filtros.dataInicio || filtros.dataFim || filtros.tipo || filtros.categoriaId);
}

export function TransactionsListPage() {
  useTituloPagina('Lançamentos');

  const escrita = podeEscrever();

  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<TransactionListResponse | null>(null);
  const [categorias, setCategorias] = useState<CategoryOption[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  useEffect(() => {
    let cancelado = false;

    apiRequest<CategoryListResponse>('/categorias')
      .then((resposta) => {
        if (!cancelado) setCategorias(resposta.dados);
      })
      .catch(() => {
        // Filtro de categoria fica sem opções se a busca falhar; não bloqueia a listagem.
      });

    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro(null);

      try {
        const dados = await apiRequest<TransactionListResponse>(
          `/lancamentos?${montarQueryString(filtros, pagina)}`,
        );
        if (!cancelado) setResultado(dados);
      } catch (error) {
        if (!cancelado) {
          setErro(
            error instanceof ApiError ? error.message : 'Não foi possível carregar os lançamentos',
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
  }, [filtros, pagina]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPagina(1);
  }

  function limparFiltros() {
    setFiltros(SEM_FILTROS);
    setPagina(1);
  }

  const semResultados = Boolean(resultado && resultado.dados.length === 0 && !carregando);
  const mostrarTabela = carregando || Boolean(resultado && resultado.dados.length > 0);

  return (
    <main data-largura="ampla">
      <div className="cabecalho-pagina">
        <div>
          <h1>Lançamentos</h1>
          {resultado && (
            <p className="cabecalho-pagina__apoio">
              {resultado.paginacao.total}{' '}
              {resultado.paginacao.total === 1 ? 'lançamento' : 'lançamentos'} no período
            </p>
          )}
        </div>

        {escrita && (
          <div className="acoes">
            <Link className="acao" to="/lancamentos/entrada">
              Registrar entrada
            </Link>
            <Link className="acao" data-variante="secundario" to="/lancamentos/saida">
              Registrar saída
            </Link>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <fieldset className="filtros" data-recolhivel data-aberto={filtrosAbertos}>
          <legend>Filtrar</legend>

          <div className="filtros__resumo">
            <span>{resumirFiltros(filtros, categorias)}</span>
            <button
              type="button"
              data-variante="secundario"
              aria-expanded={filtrosAbertos}
              aria-controls="filtros-lancamentos"
              onClick={() => setFiltrosAbertos((aberto) => !aberto)}
            >
              {filtrosAbertos ? 'Ocultar' : 'Alterar'}
            </button>
          </div>

          <div className="filtros__campos" id="filtros-lancamentos">
            {/* Os dois campos comecam vazios, porque a listagem abre sem recorte de
                periodo, entao o painel oferece Limpar para desfazer a escolha. */}
            <SeletorData
              rotulo="De"
              valor={filtros.dataInicio}
              limpavel
              aoSelecionar={(data) => setFiltros((atual) => ({ ...atual, dataInicio: data }))}
            />

            <SeletorData
              rotulo="Até"
              valor={filtros.dataFim}
              limpavel
              aoSelecionar={(data) => setFiltros((atual) => ({ ...atual, dataFim: data }))}
            />

            <label>
              Tipo
              <select
                value={filtros.tipo}
                onChange={(event) =>
                  setFiltros((atual) => ({
                    ...atual,
                    tipo: event.target.value as Filtros['tipo'],
                  }))
                }
              >
                <option value="">Todos</option>
                <option value="ENTRADA">Entrada</option>
                <option value="SAIDA">Saída</option>
              </select>
            </label>

            <label>
              Categoria
              <select
                value={filtros.categoriaId}
                onChange={(event) =>
                  setFiltros((atual) => ({ ...atual, categoriaId: event.target.value }))
                }
              >
                <option value="">Todas</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit">Filtrar</button>
          </div>
        </fieldset>
      </form>

      {carregando && (
        <p role="status" className="apenas-leitor">
          Carregando lançamentos
        </p>
      )}
      {erro && <p role="alert">{erro}</p>}

      {/* Tres vazios diferentes: o mes que a tela abre sem movimento, o recorte que o
          usuario montou sem resultado, e o caixa que nunca teve lancamento. */}
      {semResultados &&
        (ehPeriodoPadrao(filtros) ? (
          <EstadoVazio
            titulo={`Nenhum lançamento em ${formatarCompetencia(filtros.dataInicio.slice(0, 7))}`}
            descricao="A listagem abre no mês corrente. Veja o histórico completo para encontrar lançamentos de meses anteriores."
            acoes={
              <>
                <button type="button" data-variante="secundario" onClick={limparFiltros}>
                  Ver todo o histórico
                </button>
                {escrita && (
                  <Link className="acao" to="/lancamentos/entrada">
                    Registrar entrada
                  </Link>
                )}
              </>
            }
          />
        ) : temFiltroAplicado(filtros) ? (
          <EstadoVazio
            titulo="Nenhum lançamento no período"
            descricao="Os filtros aplicados não encontraram movimentações. Amplie o período ou limpe os filtros para ver a trilha completa."
            acoes={
              <button type="button" data-variante="secundario" onClick={limparFiltros}>
                Limpar filtros
              </button>
            }
          />
        ) : (
          <EstadoVazio
            titulo="O caixa ainda está vazio"
            descricao={
              escrita
                ? 'Nenhum lançamento foi registrado até agora. Comece pela primeira entrada e o extrato passa a se montar sozinho.'
                : 'Nenhum lançamento foi registrado até agora. Assim que a tesouraria registrar o primeiro, ele aparece aqui.'
            }
            acoes={
              escrita ? (
                <Link className="acao" to="/lancamentos/entrada">
                  Registrar entrada
                </Link>
              ) : undefined
            }
          />
        ))}

      {mostrarTabela && (
        <TabelaRolavel titulo="Lançamentos" cartoes>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th data-alinha="direita">Valor</th>
                <th data-alinha="centro">
                  <span className="apenas-leitor">Comprovante</span>
                  <span aria-hidden="true">Comp.</span>
                </th>
                <th>
                  <span className="apenas-leitor">Ações</span>
                </th>
              </tr>
            </thead>

            {carregando && <TabelaEsqueleto colunas={COLUNAS} />}

            {!carregando && resultado && (
              <tbody>
                {resultado.dados.map((lancamento) => (
                  <tr
                    key={lancamento.id}
                    className={lancamento.status === 'ESTORNADO' ? 'linha--estornada' : undefined}
                  >
                    <td data-campo="data">{formatarData(lancamento.data)}</td>
                    <td data-coluna="texto" data-campo="descricao">
                      {lancamento.descricao}{' '}
                      {lancamento.status === 'ESTORNADO' && (
                        <span className="etiqueta etiqueta--estornado">Estornado</span>
                      )}
                    </td>
                    <td data-coluna="texto" data-campo="categoria">
                      {lancamento.categoria.nome}
                    </td>
                    <td data-alinha="direita" data-campo="valor">
                      <span
                        className={`valor valor--${lancamento.tipo.toLowerCase()}`}
                        aria-label={`${rotuloTipo(lancamento.tipo)} de ${formatarMoeda(lancamento.valor)}`}
                      >
                        {valorComSinal(lancamento.tipo, lancamento.valor)}
                      </span>
                    </td>
                    <td data-alinha="centro" data-campo="comprovante">
                      {lancamento.possuiComprovante ? (
                        <>
                          <IconeComprovante />
                          <span className="apenas-leitor">Possui comprovante</span>
                        </>
                      ) : (
                        <span className="apenas-leitor">Sem comprovante</span>
                      )}
                    </td>
                    <td data-coluna="acao" data-campo="acao">
                      <Link
                        to={`/lancamentos/${lancamento.id}`}
                        aria-label={`Ver detalhes de ${lancamento.descricao}`}
                      >
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </TabelaRolavel>
      )}

      {resultado && resultado.paginacao.totalPaginas > 1 && (
        <nav aria-label="Paginação">
          <button
            data-variante="secundario"
            disabled={pagina <= 1}
            onClick={() => setPagina((atual) => atual - 1)}
          >
            Anterior
          </button>
          <span>
            Página {resultado.paginacao.pagina} de {resultado.paginacao.totalPaginas}
          </span>
          <button
            data-variante="secundario"
            disabled={pagina >= resultado.paginacao.totalPaginas}
            onClick={() => setPagina((atual) => atual + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
    </main>
  );
}
