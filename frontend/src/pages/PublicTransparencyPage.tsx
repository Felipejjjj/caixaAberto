import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { AppFooter, AppHeader } from '../components/AppHeader';
import { EstadoVazio } from '../components/ui/EstadoVazio';
import { SeletorMes } from '../components/ui/SeletorMes';
import { TabelaRolavel } from '../components/ui/TabelaRolavel';
import { mesAtual, mesEhValido } from '../lib/data';
import { formatarCompetencia, formatarMoeda, rotuloTipo } from '../lib/formato';
import { ApiError, apiRequest } from '../lib/httpClient';
import { useTituloPagina } from '../lib/useTituloPagina';

type TransactionType = 'ENTRADA' | 'SAIDA';

interface CategoryAggregate {
  type: TransactionType;
  category: string;
  total: string;
  count: number;
}

interface PublicTransparencyResponse {
  organization: { name: string; description: string };
  month: string;
  totals: { entries: string; exits: string; balance: string };
  byCategory: CategoryAggregate[];
  privacy: { personalFieldsHidden: boolean };
}

export function PublicTransparencyPage() {
  const { link } = useParams<{ link: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const mesDaUrl = searchParams.get('mes');
  const mesInicial = mesEhValido(mesDaUrl) ? mesDaUrl : mesAtual();
  const [mes, setMes] = useState(mesInicial);
  const [dados, setDados] = useState<PublicTransparencyResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useTituloPagina(dados ? `${dados.organization.name}, prestação de contas` : 'Transparência');

  useEffect(() => {
    if (!link) return;

    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro(null);

      try {
        const resposta = await apiRequest<PublicTransparencyResponse>(
          `/transparency/${link}?mes=${encodeURIComponent(mes)}`,
          { auth: false },
        );
        if (!cancelado) setDados(resposta);
      } catch (error) {
        if (!cancelado) {
          setErro(
            error instanceof ApiError
              ? error.message
              : 'Não foi possível carregar a página de transparência',
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
  }, [link, mes]);

  function handleMesChange(novoMes: string) {
    setMes(novoMes);
    setSearchParams({ mes: novoMes });
  }

  if (carregando) {
    return (
      <>
        <AppHeader />
        <main>
          <p role="status">Carregando a prestação de contas...</p>
        </main>
      </>
    );
  }

  // O visitante cai aqui quando o link foi trocado ou a transparência foi desativada,
  // então a tela explica o que aconteceu em vez de mostrar só o erro cru da API.
  if (erro || !dados) {
    return (
      <>
        <AppHeader />
        <main>
          <EstadoVazio
            titulo="Prestação de contas indisponível"
            descricao="Este link não está mais ativo. Ele pode ter sido desativado ou substituído por um novo endereço. Peça a quem cuida do caixa o link atualizado."
          />
          <p role="alert" className="apenas-leitor">
            {erro ?? 'Página de transparência não encontrada.'}
          </p>
        </main>
        <AppFooter />
      </>
    );
  }

  return (
    <>
      <AppHeader />

      <main data-largura="ampla">
        <div className="capa-publica">
          <span className="capa-publica__selo">Prestação de contas pública</span>
          <h1>{dados.organization.name}</h1>
          <p className="capa-publica__descricao">{dados.organization.description}</p>
        </div>

        <form>
          <fieldset className="filtros">
            <legend>Competência</legend>

            <div className="filtros__campos">
              <SeletorMes valor={mes} aoSelecionar={handleMesChange} />
            </div>
          </fieldset>
        </form>

        <section className="numeros" aria-label={`Totais de ${formatarCompetencia(dados.month)}`}>
          <div className="numeros__item numeros__item--entrada">
            <span className="numeros__rotulo">Entradas</span>
            <strong className="numeros__valor">{formatarMoeda(dados.totals.entries)}</strong>
          </div>
          <div className="numeros__item numeros__item--saida">
            <span className="numeros__rotulo">Saídas</span>
            <strong className="numeros__valor">{formatarMoeda(dados.totals.exits)}</strong>
          </div>
          <div className="numeros__item numeros__item--saldo">
            <span className="numeros__rotulo">Saldo</span>
            <strong className="numeros__valor">{formatarMoeda(dados.totals.balance)}</strong>
            <span className="numeros__apoio">{formatarCompetencia(dados.month)}</span>
          </div>
        </section>

        {dados.byCategory.length === 0 ? (
          <EstadoVazio
            titulo="Sem movimentações neste mês"
            descricao="Nenhuma entrada ou saída foi registrada na competência selecionada. Escolha outro mês para ver o histórico."
          />
        ) : (
          <TabelaRolavel titulo="Movimentações por categoria" cartoes>
            <table>
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Tipo</th>
                  <th data-alinha="direita">Total</th>
                  <th data-alinha="direita">Lançamentos</th>
                </tr>
              </thead>
              <tbody>
                {dados.byCategory.map((linha) => (
                  <tr key={`${linha.type}-${linha.category}`}>
                    <td data-coluna="texto" data-campo="nome">
                      {linha.category}
                    </td>
                    <td data-coluna="texto" data-campo="tipo">
                      {rotuloTipo(linha.type)}
                    </td>
                    <td data-alinha="direita" data-campo="valor">
                      <span className={`valor valor--${linha.type.toLowerCase()}`}>
                        {formatarMoeda(linha.total)}
                      </span>
                    </td>
                    <td data-alinha="direita" data-campo="quantidade" data-rotulo="Lançamentos">
                      {linha.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
        )}

        {dados.privacy.personalFieldsHidden && (
          <p className="nota-rodape">
            Nenhum dado pessoal de responsáveis é exibido nesta página, conforme a LGPD. Os valores
            apresentados são agregados por categoria a partir dos lançamentos registrados no
            período.
          </p>
        )}
      </main>

      <AppFooter />
    </>
  );
}
