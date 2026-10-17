import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { EstadoVazio } from '../components/ui/EstadoVazio';
import { TabelaEsqueleto } from '../components/ui/TabelaEsqueleto';
import { TabelaRolavel } from '../components/ui/TabelaRolavel';
import { formatarData, rotuloPapel } from '../lib/formato';
import { ApiError, apiRequest } from '../lib/httpClient';
import { getOrganizationId, podeEscrever } from '../lib/session';
import type { Papel } from '../lib/session';
import { useTituloPagina } from '../lib/useTituloPagina';

interface Member {
  id: string;
  usuario: { id: string; nome: string; email: string };
  papel: Papel;
  dataVinculo: string;
  ativo: boolean;
}

interface MemberListResponse {
  dados: Member[];
}

// GET /organizacoes/{id}/membros exige o id real da organização no caminho. O seletor da US13
// persiste o contexto escolhido; o fallback mantém esta página testável fora do shell protegido.
interface OrganizacaoDoUsuario {
  vinculoId: string;
  papel: Papel;
  dataVinculo: string;
  organizacao: { id: string };
}

interface OrganizacoesDoUsuarioResponse {
  dados: OrganizacaoDoUsuario[];
}

const PAPEIS: Papel[] = ['CONSULTOR', 'TESOUREIRO'];

export function MembersPage() {
  useTituloPagina('Membros');

  const escrita = podeEscrever();

  const [organizacaoId, setOrganizacaoId] = useState<string | null>(null);
  const [membros, setMembros] = useState<Member[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [vinculando, setVinculando] = useState(false);
  const [erroVinculo, setErroVinculo] = useState<string | null>(null);

  const [alterandoId, setAlterandoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro(null);

      try {
        const idPersistido = getOrganizationId();
        let id = idPersistido;

        if (!id) {
          const organizacoes =
            await apiRequest<OrganizacoesDoUsuarioResponse>('/users/me/organizacoes');
          id = organizacoes.dados[0]?.organizacao.id ?? null;
        }

        if (!id) {
          if (!cancelado) {
            setErro('Nenhuma organização vinculada à sua conta.');
            setCarregando(false);
          }
          return;
        }

        if (cancelado) return;
        setOrganizacaoId(id);

        const resposta = await apiRequest<MemberListResponse>(
          `/organizacoes/${id}/membros`,
        );
        if (!cancelado) setMembros(resposta.dados);
      } catch (error) {
        if (!cancelado) {
          setErro(
            error instanceof ApiError ? error.message : 'Não foi possível carregar os membros',
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

  async function handleVincular(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizacaoId) return;

    setVinculando(true);
    setErroVinculo(null);
    setMensagem(null);

    try {
      const novoMembro = await apiRequest<Member>(`/organizacoes/${organizacaoId}/membros`, {
        method: 'POST',
        body: { email },
      });

      setMembros((atual) => [...atual, novoMembro]);
      setMensagem(`${novoMembro.usuario.nome} foi vinculado à organização.`);
      setEmail('');
    } catch (error) {
      setErroVinculo(
        error instanceof ApiError ? error.message : 'Não foi possível vincular o usuário',
      );
    } finally {
      setVinculando(false);
    }
  }

  async function handleAlterarPapel(membro: Member, papel: Papel) {
    if (papel === membro.papel) return;

    setAlterandoId(membro.id);
    setErro(null);
    setMensagem(null);

    try {
      const atualizado = await apiRequest<Member>(`/membros/${membro.id}/papel`, {
        method: 'PUT',
        body: { papel },
      });

      setMembros((atual) => atual.map((item) => (item.id === membro.id ? atualizado : item)));
      setMensagem(`Papel de ${atualizado.usuario.nome} alterado para ${rotuloPapel(papel)}.`);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível alterar o papel');
    } finally {
      setAlterandoId(null);
    }
  }

  return (
    <main data-largura="ampla">
      <div className="cabecalho-pagina">
        <div>
          <h1>Membros</h1>
          <p className="cabecalho-pagina__apoio">
            Quem tem acesso à organização e o papel de cada um.
          </p>
        </div>
      </div>

      {escrita && (
        <form onSubmit={handleVincular}>
          <fieldset className="filtros">
            <legend>Vincular membro</legend>

            <div className="filtros__campos">
              <label>
                E-mail do usuário
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="pessoa@exemplo.com"
                  required
                />
              </label>

              <button type="submit" disabled={vinculando || !organizacaoId}>
                {vinculando ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>

            {erroVinculo && <small role="alert">{erroVinculo}</small>}
          </fieldset>
        </form>
      )}

      {mensagem && <p role="status">{mensagem}</p>}
      {erro && <p role="alert">{erro}</p>}

      {!carregando && membros.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum membro vinculado"
          descricao="Ainda não há membros ativos nesta organização."
        />
      ) : (
        <TabelaRolavel titulo="Membros da organização">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Vínculo desde</th>
              </tr>
            </thead>
            {carregando ? (
              <TabelaEsqueleto colunas={4} />
            ) : (
              <tbody>
                {membros.map((membro) => (
                  <tr key={membro.id}>
                    <td data-coluna="texto">{membro.usuario.nome}</td>
                    <td data-coluna="texto">{membro.usuario.email}</td>
                    <td data-coluna="texto">
                      {escrita ? (
                        <select
                          value={membro.papel}
                          disabled={alterandoId === membro.id}
                          onChange={(event) =>
                            handleAlterarPapel(membro, event.target.value as Papel)
                          }
                          aria-label={`Papel de ${membro.usuario.nome}`}
                        >
                          {PAPEIS.map((papel) => (
                            <option key={papel} value={papel}>
                              {rotuloPapel(papel)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="etiqueta">{rotuloPapel(membro.papel)}</span>
                      )}
                    </td>
                    <td data-coluna="texto">{formatarData(membro.dataVinculo)}</td>
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
