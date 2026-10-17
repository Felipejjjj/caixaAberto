import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { CategorySelect } from '../components/CategorySelect';
import { SeletorData } from '../components/ui/SeletorData';
import { ApiError, apiRequest } from '../lib/httpClient';
import { useTituloPagina } from '../lib/useTituloPagina';

type TransactionType = 'ENTRADA' | 'SAIDA';

interface TransactionDetail {
  id: string;
  date: string;
  type: TransactionType;
  amount: string;
  description: string;
  source: string | null;
  recipient: string | null;
  status: 'ATIVO' | 'ESTORNADO';
  category: { id: string; name: string; type: TransactionType };
}

interface FormValues {
  categoriaId: string;
  valor: string;
  data: string;
  descricao: string;
  parte: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

function normalizarValor(valor: string): string {
  return valor.replace(',', '.');
}

function validarValor(valor: string): boolean {
  const numero = Number(normalizarValor(valor));
  return Number.isFinite(numero) && numero > 0;
}

function validar(values: FormValues): FieldErrors {
  const erros: FieldErrors = {};

  if (!values.categoriaId) erros.categoriaId = 'Selecione uma categoria.';
  if (!values.valor || !validarValor(values.valor)) {
    erros.valor = 'Informe um valor maior que zero.';
  }
  if (!values.data) erros.data = 'Informe a data do lançamento.';
  if (!values.descricao.trim()) erros.descricao = 'Informe a descrição do lançamento.';

  return erros;
}

export function EditTransactionPage() {
  useTituloPagina('Corrigir lançamento');

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lancamento, setLancamento] = useState<TransactionDetail | null>(null);
  const [values, setValues] = useState<FormValues | null>(null);
  const [errosCampos, setErrosCampos] = useState<FieldErrors>({});
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!id) return;

    let cancelado = false;

    async function carregar() {
      try {
        const dados = await apiRequest<TransactionDetail>(`/transactions/${id}`);
        if (cancelado) return;

        setLancamento(dados);
        setValues({
          categoriaId: dados.category.id,
          valor: dados.amount,
          data: dados.date.slice(0, 10),
          descricao: dados.description,
          parte: dados.type === 'ENTRADA' ? (dados.source ?? '') : (dados.recipient ?? ''),
        });
      } catch (error) {
        if (!cancelado) {
          setErro(
            error instanceof ApiError ? error.message : 'Não foi possível carregar o lançamento.',
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
  }, [id]);

  if (!id) {
    return (
      <main>
        <p role="alert">Lançamento não encontrado.</p>
        <p>
          <Link to="/lancamentos">Voltar para a listagem</Link>
        </p>
      </main>
    );
  }

  function alterar(campo: keyof FormValues, valor: string) {
    setValues((atuais) => (atuais ? { ...atuais, [campo]: valor } : atuais));
    setErrosCampos((atuais) => ({ ...atuais, [campo]: undefined }));
    setErro(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !lancamento || !values) return;

    const proximosErros = validar(values);
    setErrosCampos(proximosErros);
    setErro(null);

    if (Object.keys(proximosErros).length > 0) return;

    setSalvando(true);

    try {
      await apiRequest<TransactionDetail>(`/transactions/${id}`, {
        method: 'PUT',
        body: {
          categoryId: values.categoriaId,
          amount: normalizarValor(values.valor),
          date: values.data,
          description: values.descricao.trim(),
          ...(lancamento.type === 'ENTRADA'
            ? { source: values.parte.trim() || null }
            : { recipient: values.parte.trim() || null }),
        },
      });

      navigate(`/lancamentos/${id}`, { replace: true });
    } catch (error) {
      setErro(
        error instanceof ApiError ? error.message : 'Não foi possível corrigir o lançamento.',
      );
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <main>
        <p role="status">Carregando lançamento...</p>
      </main>
    );
  }

  if (erro || !lancamento || !values) {
    return (
      <main>
        <p role="alert">{erro ?? 'Lançamento não encontrado.'}</p>
        <p>
          <Link to={id ? `/lancamentos/${id}` : '/lancamentos'}>Voltar</Link>
        </p>
      </main>
    );
  }

  if (lancamento.status === 'ESTORNADO') {
    return (
      <main>
        <h1>Corrigir lançamento</h1>
        <p role="alert">
          Este lançamento foi estornado e não pode ser editado. Registre um novo lançamento com os
          dados corretos.
        </p>
        <p>
          <Link to={`/lancamentos/${lancamento.id}`}>Voltar para o detalhe</Link>
        </p>
      </main>
    );
  }

  const rotuloParte = lancamento.type === 'ENTRADA' ? 'Origem' : 'Destinatário';

  return (
    <main>
      <div className="cabecalho-pagina">
        <div>
          <h1>Corrigir lançamento</h1>
          <p className="cabecalho-pagina__apoio">
            Altere os dados permitidos sem mudar a organização ou o responsável original.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="formulario-coluna">
        <CategorySelect
          tipo={lancamento.type}
          value={values.categoriaId}
          onChange={(valor) => alterar('categoriaId', valor)}
          required
          disabled={salvando}
          invalid={Boolean(errosCampos.categoriaId)}
        />
        {errosCampos.categoriaId && <small role="alert">{errosCampos.categoriaId}</small>}

        <label>
          Valor (R$)
          <input
            type="text"
            inputMode="decimal"
            value={values.valor}
            onChange={(event) => alterar('valor', event.target.value)}
            required
            disabled={salvando}
            aria-invalid={errosCampos.valor ? true : undefined}
          />
          {errosCampos.valor && <small role="alert">{errosCampos.valor}</small>}
        </label>

        <SeletorData
          rotulo="Data"
          valor={values.data}
          invalido={Boolean(errosCampos.data)}
          mensagem={errosCampos.data && <small role="alert">{errosCampos.data}</small>}
          aoSelecionar={(valor) => alterar('data', valor)}
        />

        <label>
          {rotuloParte}
          <input
            type="text"
            value={values.parte}
            onChange={(event) => alterar('parte', event.target.value)}
            disabled={salvando}
          />
        </label>

        <label>
          Descrição
          <textarea
            value={values.descricao}
            onChange={(event) => alterar('descricao', event.target.value)}
            required
            maxLength={5000}
            disabled={salvando}
            aria-invalid={errosCampos.descricao ? true : undefined}
          />
          {errosCampos.descricao && <small role="alert">{errosCampos.descricao}</small>}
        </label>

        {erro && <p role="alert">{erro}</p>}

        <div className="acoes">
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
          <Link className="acao" data-variante="secundario" to={`/lancamentos/${id}`}>
            Cancelar
          </Link>
        </div>
      </form>
    </main>
  );
}
