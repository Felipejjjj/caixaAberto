import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { EstadoVazio } from '../components/ui/EstadoVazio';
import { formatarData, formatarMoeda } from '../lib/formato';
import { ApiError, apiRequest } from '../lib/httpClient';
import { podeEscrever } from '../lib/session';
import { useTituloPagina } from '../lib/useTituloPagina';

type GoalStatus = 'EM_ANDAMENTO' | 'PRAZO_ENCERRADO' | 'CONCLUIDA';

interface Goal {
  id: string;
  descricao: string;
  valorAlvo: string;
  prazo: string;
  valorArrecadado: string;
  percentual: number;
  situacao: GoalStatus;
  situacaoDescricao: string;
}

interface GoalWriteResponse {
  id: string;
  descricao: string;
  valorAlvo: string;
  prazo: string;
}

interface GoalListResponse {
  dados: Goal[];
}

interface FormValues {
  descricao: string;
  valorAlvo: string;
  prazo: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const VALORES_VAZIOS: FormValues = {
  descricao: '',
  valorAlvo: '',
  prazo: '',
};

function hojeIso(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function normalizarValor(valor: string): string {
  return valor.replace(',', '.').trim();
}

function validar(values: FormValues): FieldErrors {
  const erros: FieldErrors = {};
  const valor = normalizarValor(values.valorAlvo);

  if (!values.descricao.trim()) {
    erros.descricao = 'Informe a descrição da meta.';
  }

  if (!/^\d+(\.\d{1,2})?$/.test(valor) || Number(valor) <= 0) {
    erros.valorAlvo = 'Informe um valor-alvo maior que zero.';
  }

  if (!values.prazo) {
    erros.prazo = 'Informe o prazo da meta.';
  } else if (values.prazo < hojeIso()) {
    erros.prazo = 'O prazo deve ser hoje ou uma data futura.';
  }

  return erros;
}

function percentualSeguro(percentual: number): number {
  return Math.min(Math.max(percentual, 0), 100);
}

export function GoalsPage() {
  useTituloPagina('Metas');

  const escrita = podeEscrever();
  const [metas, setMetas] = useState<Goal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [form, setForm] = useState<FormValues>(VALORES_VAZIOS);
  const [errosCampos, setErrosCampos] = useState<FieldErrors>({});
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregarMetas = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    try {
      const resposta = await apiRequest<GoalListResponse>('/metas');
      setMetas(resposta.dados);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível carregar as metas.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarMetas();
  }, [carregarMetas]);

  function alterar(campo: keyof FormValues, valor: string) {
    setForm((atuais) => ({ ...atuais, [campo]: valor }));
    setErrosCampos((atuais) => ({ ...atuais, [campo]: undefined }));
    setErroFormulario(null);
    setMensagem(null);
  }

  function iniciarEdicao(meta: Goal) {
    setEditandoId(meta.id);
    setForm({ descricao: meta.descricao, valorAlvo: meta.valorAlvo, prazo: meta.prazo });
    setErrosCampos({});
    setErroFormulario(null);
    setMensagem(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm(VALORES_VAZIOS);
    setErrosCampos({});
    setErroFormulario(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const proximosErros = validar(form);
    setErrosCampos(proximosErros);
    setErroFormulario(null);
    setMensagem(null);

    if (Object.keys(proximosErros).length > 0) return;

    setSalvando(true);

    try {
      const body = {
        descricao: form.descricao.trim(),
        valorAlvo: normalizarValor(form.valorAlvo),
        prazo: form.prazo,
      };
      const resposta = editandoId
        ? await apiRequest<GoalWriteResponse>(`/metas/${editandoId}`, {
            method: 'PUT',
            body,
          })
        : await apiRequest<GoalWriteResponse>('/metas', { method: 'POST', body });

      await carregarMetas();
      setForm(VALORES_VAZIOS);
      setErrosCampos({});
      setEditandoId(null);
      setMensagem(
        editandoId
          ? `Meta "${resposta.descricao}" atualizada.`
          : `Meta "${resposta.descricao}" cadastrada.`,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        setErroFormulario(error.message);
        setErrosCampos((atuais) => ({ ...atuais, ...error.fields }));
      } else {
        setErroFormulario(
          editandoId ? 'Não foi possível alterar a meta.' : 'Não foi possível cadastrar a meta.',
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main data-largura="ampla">
      <div className="cabecalho-pagina">
        <div>
          <h1>Metas de arrecadação</h1>
          <p className="cabecalho-pagina__apoio">
            Acompanhe os objetivos financeiros e o progresso das entradas da organização.
          </p>
        </div>
      </div>

      {escrita && (
        <form onSubmit={handleSubmit} noValidate>
          <fieldset className="filtros">
            <legend>{editandoId ? 'Editar meta' : 'Cadastrar meta'}</legend>

            <div className="filtros__campos metas__formulario">
              <label>
                Descrição
                <input
                  type="text"
                  value={form.descricao}
                  onChange={(event) => alterar('descricao', event.target.value)}
                  maxLength={255}
                  required
                  disabled={salvando}
                  aria-invalid={errosCampos.descricao ? true : undefined}
                />
                {errosCampos.descricao && <small role="alert">{errosCampos.descricao}</small>}
              </label>

              <label>
                Valor-alvo (R$)
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.valorAlvo}
                  onChange={(event) => alterar('valorAlvo', event.target.value)}
                  placeholder="20000,00"
                  required
                  disabled={salvando}
                  aria-invalid={errosCampos.valorAlvo ? true : undefined}
                />
                {errosCampos.valorAlvo && <small role="alert">{errosCampos.valorAlvo}</small>}
              </label>

              <label>
                Prazo
                <input
                  type="date"
                  value={form.prazo}
                  onChange={(event) => alterar('prazo', event.target.value)}
                  min={hojeIso()}
                  required
                  disabled={salvando}
                  aria-invalid={errosCampos.prazo ? true : undefined}
                />
                {errosCampos.prazo && <small role="alert">{errosCampos.prazo}</small>}
              </label>

              <div className="acoes metas__acoes">
                <button type="submit" disabled={salvando}>
                  {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Cadastrar'}
                </button>
                {editandoId && (
                  <button type="button" data-variante="secundario" onClick={cancelarEdicao}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            {erroFormulario && <small role="alert">{erroFormulario}</small>}
          </fieldset>
        </form>
      )}

      {mensagem && <p role="status">{mensagem}</p>}
      {erro && <p role="alert">{erro}</p>}

      {!carregando && metas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma meta cadastrada"
          descricao="Ainda não há metas de arrecadação nesta organização."
        />
      ) : (
        <section className="metas-lista" aria-label="Metas de arrecadação">
          {carregando ? (
            <p role="status">Carregando metas...</p>
          ) : (
            metas.map((meta) => (
              <article className="meta-card" key={meta.id}>
                <div className="meta-card__cabecalho">
                  <div>
                    <h2>{meta.descricao}</h2>
                    <p>Prazo: {formatarData(meta.prazo)}</p>
                  </div>
                  <span className="etiqueta">{meta.situacaoDescricao}</span>
                </div>

                <progress
                  max="100"
                  value={percentualSeguro(meta.percentual)}
                  aria-label={`Progresso de ${meta.descricao}`}
                />

                <div className="meta-card__resumo">
                  <span>
                    {formatarMoeda(meta.valorArrecadado)} de {formatarMoeda(meta.valorAlvo)}
                  </span>
                  <strong>{meta.percentual.toLocaleString('pt-BR')}%</strong>
                </div>

                {escrita && (
                  <div className="acoes">
                    <button
                      type="button"
                      data-variante="secundario"
                      onClick={() => iniciarEdicao(meta)}
                    >
                      Editar
                    </button>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      )}
    </main>
  );
}
