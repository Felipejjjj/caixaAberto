import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { EstadoVazio } from '../components/ui/EstadoVazio';
import { TabelaEsqueleto } from '../components/ui/TabelaEsqueleto';
import { TabelaRolavel } from '../components/ui/TabelaRolavel';
import { rotuloTipo } from '../lib/formato';
import { ApiError, apiRequest } from '../lib/httpClient';
import { podeEscrever } from '../lib/session';
import { useTituloPagina } from '../lib/useTituloPagina';

type CategoryType = 'ENTRADA' | 'SAIDA';

interface Category {
  id: string;
  nome: string;
  descricao: string;
  tipo: CategoryType;
}

interface CategoryListResponse {
  dados: Category[];
}

interface CategoryWriteResponse {
  id: string;
  nome: string;
  descricao: string;
  tipo: CategoryType;
}

const TIPOS: CategoryType[] = ['ENTRADA', 'SAIDA'];

export function CategoriesPage() {
  useTituloPagina('Categorias');

  const escrita = podeEscrever();

  const [categorias, setCategorias] = useState<Category[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<CategoryType>('SAIDA');
  const [cadastrando, setCadastrando] = useState(false);
  const [erroCadastro, setErroCadastro] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState('');
  const [descricaoEdicao, setDescricaoEdicao] = useState('');
  const [tipoEdicao, setTipoEdicao] = useState<CategoryType>('SAIDA');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro(null);

      try {
        const resposta = await apiRequest<CategoryListResponse>('/categorias');
        if (!cancelado) setCategorias(resposta.dados);
      } catch (error) {
        if (!cancelado) {
          setErro(
            error instanceof ApiError ? error.message : 'Não foi possível carregar as categorias',
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
  }, []);

  async function handleCadastrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCadastrando(true);
    setErroCadastro(null);
    setMensagem(null);

    try {
      const nova = await apiRequest<CategoryWriteResponse>('/categorias', {
        method: 'POST',
        body: { nome, descricao: descricao || undefined, tipo },
      });

      setCategorias((atual) =>
        [...atual, nova].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      );
      setMensagem(`Categoria "${nova.nome}" cadastrada.`);
      setNome('');
      setDescricao('');
      setTipo('SAIDA');
    } catch (error) {
      setErroCadastro(
        error instanceof ApiError ? error.message : 'Não foi possível cadastrar a categoria',
      );
    } finally {
      setCadastrando(false);
    }
  }

  function iniciarEdicao(categoria: Category) {
    setEditandoId(categoria.id);
    setNomeEdicao(categoria.nome);
    setDescricaoEdicao(categoria.descricao);
    setTipoEdicao(categoria.tipo);
    setErroEdicao(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setErroEdicao(null);
  }

  async function salvarEdicao(id: string) {
    setSalvandoEdicao(true);
    setErroEdicao(null);
    setMensagem(null);

    try {
      const atualizada = await apiRequest<CategoryWriteResponse>(`/categorias/${id}`, {
        method: 'PUT',
        body: { nome: nomeEdicao, descricao: descricaoEdicao, tipo: tipoEdicao },
      });

      setCategorias((atual) =>
        atual
          .map((item) => (item.id === id ? atualizada : item))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      );
      setMensagem(`Categoria "${atualizada.nome}" atualizada.`);
      setEditandoId(null);
    } catch (error) {
      setErroEdicao(
        error instanceof ApiError ? error.message : 'Não foi possível alterar a categoria',
      );
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function confirmarExclusao(categoria: Category) {
    setExcluindo(true);
    setErroExclusao(null);
    setMensagem(null);

    try {
      await apiRequest<void>(`/categorias/${categoria.id}`, { method: 'DELETE' });

      setCategorias((atual) => atual.filter((item) => item.id !== categoria.id));
      setMensagem(`Categoria "${categoria.nome}" excluída.`);
      setConfirmandoExclusaoId(null);
    } catch (error) {
      setErroExclusao(
        error instanceof ApiError ? error.message : 'Não foi possível excluir a categoria',
      );
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <main data-largura="ampla">
      <div className="cabecalho-pagina">
        <div>
          <h1>Categorias</h1>
          <p className="cabecalho-pagina__apoio">
            Categorias ativas usadas nos lançamentos de entrada e saída.
          </p>
        </div>
      </div>

      {escrita && (
        <form onSubmit={handleCadastrar}>
          <fieldset className="filtros">
            <legend>Cadastrar categoria</legend>

            <div className="filtros__campos">
              <label>
                Nome
                <input
                  type="text"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  required
                />
              </label>

              <label>
                Descrição
                <input
                  type="text"
                  value={descricao}
                  onChange={(event) => setDescricao(event.target.value)}
                />
              </label>

              <label>
                Tipo
                <select
                  value={tipo}
                  onChange={(event) => setTipo(event.target.value as CategoryType)}
                >
                  {TIPOS.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {rotuloTipo(opcao)}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" disabled={cadastrando}>
                {cadastrando ? 'Cadastrando...' : 'Cadastrar'}
              </button>
            </div>

            {erroCadastro && <small role="alert">{erroCadastro}</small>}
          </fieldset>
        </form>
      )}

      {mensagem && <p role="status">{mensagem}</p>}
      {erro && <p role="alert">{erro}</p>}
      {erroEdicao && <p role="alert">{erroEdicao}</p>}
      {erroExclusao && <p role="alert">{erroExclusao}</p>}

      {!carregando && categorias.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma categoria cadastrada"
          descricao="Ainda não há categorias ativas nesta organização."
        />
      ) : (
        <TabelaRolavel titulo="Categorias" cartoes>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                {escrita && <th>Ações</th>}
              </tr>
            </thead>
            {carregando ? (
              <TabelaEsqueleto colunas={escrita ? 3 : 2} />
            ) : (
              <tbody>
                {categorias.map((categoria) => (
                  <tr key={categoria.id}>
                    {editandoId === categoria.id ? (
                      <>
                        <td data-coluna="texto" data-campo="nome">
                          <div className="categoria__edicao">
                            <input
                              type="text"
                              value={nomeEdicao}
                              onChange={(event) => setNomeEdicao(event.target.value)}
                              aria-label={`Nome de ${categoria.nome}`}
                            />
                            <input
                              type="text"
                              value={descricaoEdicao}
                              onChange={(event) => setDescricaoEdicao(event.target.value)}
                              placeholder="Descrição"
                              aria-label={`Descrição de ${categoria.nome}`}
                            />
                          </div>
                        </td>
                        <td data-coluna="texto" data-campo="tipo">
                          <select
                            value={tipoEdicao}
                            onChange={(event) => setTipoEdicao(event.target.value as CategoryType)}
                            aria-label={`Tipo de ${categoria.nome}`}
                          >
                            {TIPOS.map((opcao) => (
                              <option key={opcao} value={opcao}>
                                {rotuloTipo(opcao)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td data-coluna="texto" data-campo="acoes">
                          <div className="acoes">
                            <button
                              type="button"
                              disabled={salvandoEdicao}
                              onClick={() => salvarEdicao(categoria.id)}
                            >
                              {salvandoEdicao ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                              type="button"
                              data-variante="secundario"
                              disabled={salvandoEdicao}
                              onClick={cancelarEdicao}
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td data-coluna="texto" data-campo="nome">
                          <span>{categoria.nome}</span>
                          {categoria.descricao && (
                            <small className="categoria__descricao">{categoria.descricao}</small>
                          )}
                        </td>
                        <td data-coluna="texto" data-campo="tipo">
                          {rotuloTipo(categoria.tipo)}
                        </td>
                        {escrita && (
                          <td data-coluna="texto" data-campo="acoes">
                            {confirmandoExclusaoId === categoria.id ? (
                              <div className="acoes">
                                <span>Confirmar exclusão?</span>
                                <button
                                  type="button"
                                  disabled={excluindo}
                                  onClick={() => confirmarExclusao(categoria)}
                                >
                                  {excluindo ? 'Excluindo...' : 'Confirmar'}
                                </button>
                                <button
                                  type="button"
                                  data-variante="secundario"
                                  disabled={excluindo}
                                  onClick={() => setConfirmandoExclusaoId(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="acoes">
                                <button
                                  type="button"
                                  data-variante="secundario"
                                  onClick={() => iniciarEdicao(categoria)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  data-variante="secundario"
                                  onClick={() => setConfirmandoExclusaoId(categoria.id)}
                                >
                                  Excluir
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </>
                    )}
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
