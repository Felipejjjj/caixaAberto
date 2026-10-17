import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError, apiRequest } from '../lib/httpClient';
import type { OrganizacaoResponse } from '../lib/organizacoes';
import { useOrganizationContext } from '../contexts/OrganizationContext';
import { useTituloPagina } from '../lib/useTituloPagina';

type OrganizationFormMode = 'criar' | 'editar';

interface OrganizationFormPageProps {
  modo: OrganizationFormMode;
}

interface FormValues {
  nome: string;
  descricao: string;
  inicioGestao: string;
  fimGestao: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const VALORES_VAZIOS: FormValues = {
  nome: '',
  descricao: '',
  inicioGestao: '',
  fimGestao: '',
};

function validar(values: FormValues): FieldErrors {
  const erros: FieldErrors = {};

  if (!values.nome.trim()) erros.nome = 'Informe o nome da organização.';
  if (!values.descricao.trim()) erros.descricao = 'Informe a descrição da organização.';
  if (!values.inicioGestao) erros.inicioGestao = 'Informe o início da gestão.';
  if (!values.fimGestao) erros.fimGestao = 'Informe o fim da gestão.';
  if (
    values.inicioGestao &&
    values.fimGestao &&
    values.fimGestao < values.inicioGestao
  ) {
    erros.fimGestao = 'A data final deve ser igual ou posterior à data inicial.';
  }

  return erros;
}

export function OrganizationFormPage({ modo }: OrganizationFormPageProps) {
  const editar = modo === 'editar';
  useTituloPagina(editar ? 'Editar organização' : 'Criar organização');

  const navigate = useNavigate();
  const { organizacaoSelecionada, atualizarOrganizacoes } = useOrganizationContext();
  const [values, setValues] = useState<FormValues>(VALORES_VAZIOS);
  const [errosCampos, setErrosCampos] = useState<FieldErrors>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!editar) {
      setValues(VALORES_VAZIOS);
      return;
    }

    const organizacao = organizacaoSelecionada?.organizacao;
    if (!organizacao) return;

    setValues({
      nome: organizacao.nome,
      descricao: organizacao.descricao,
      inicioGestao: organizacao.inicioGestao,
      fimGestao: organizacao.fimGestao,
    });
  }, [editar, organizacaoSelecionada]);

  function alterar(campo: keyof FormValues, valor: string) {
    setValues((atuais) => ({ ...atuais, [campo]: valor }));
    setErrosCampos((atuais) => ({ ...atuais, [campo]: undefined }));
    setErro(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const proximosErros = validar(values);
    setErrosCampos(proximosErros);
    setErro(null);

    if (Object.keys(proximosErros).length > 0) return;

    const organizacaoId = organizacaoSelecionada?.organizacao.id;
    if (editar && !organizacaoId) {
      setErro('Nenhuma organização foi selecionada para edição.');
      return;
    }

    setSalvando(true);

    try {
      if (editar) {
        const atualizada = await apiRequest<OrganizacaoResponse['organizacao']>(
          `/organizacoes/${organizacaoId}`,
          {
            method: 'PUT',
            body: values,
          },
        );

        await atualizarOrganizacoes(atualizada.id);
      } else {
        const criada = await apiRequest<OrganizacaoResponse>('/organizacoes', {
          method: 'POST',
          body: values,
        });

        await atualizarOrganizacoes(criada.organizacao.id);
      }

      navigate('/lancamentos', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setErro(error.message);
        setErrosCampos((atuais) => ({ ...atuais, ...error.fields }));
      } else {
        setErro(
          editar
            ? 'Não foi possível alterar a organização.'
            : 'Não foi possível criar a organização.',
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  if (editar && !organizacaoSelecionada) {
    return (
      <main>
        <h1>Editar organização</h1>
        <p role="alert">Nenhuma organização foi selecionada para edição.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="cabecalho-pagina">
        <div>
          <h1>{editar ? 'Editar organização' : 'Criar organização'}</h1>
          <p className="cabecalho-pagina__apoio">
            {editar
              ? 'Mantenha os dados institucionais e o período de gestão atualizados.'
              : 'Cadastre a organização que será usada como contexto de trabalho.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="formulario-coluna">
        <label>
          Nome
          <input
            type="text"
            value={values.nome}
            onChange={(event) => alterar('nome', event.target.value)}
            maxLength={150}
            required
            aria-invalid={errosCampos.nome ? true : undefined}
          />
          {errosCampos.nome && <small role="alert">{errosCampos.nome}</small>}
        </label>

        <label>
          Descrição
          <textarea
            value={values.descricao}
            onChange={(event) => alterar('descricao', event.target.value)}
            maxLength={5000}
            required
            aria-invalid={errosCampos.descricao ? true : undefined}
          />
          {errosCampos.descricao && <small role="alert">{errosCampos.descricao}</small>}
        </label>

        <div className="formulario-coluna formulario-coluna--duas-colunas">
          <label>
            Início da gestão
            <input
              type="date"
              value={values.inicioGestao}
              onChange={(event) => alterar('inicioGestao', event.target.value)}
              required
              aria-invalid={errosCampos.inicioGestao ? true : undefined}
            />
            {errosCampos.inicioGestao && <small role="alert">{errosCampos.inicioGestao}</small>}
          </label>

          <label>
            Fim da gestão
            <input
              type="date"
              value={values.fimGestao}
              onChange={(event) => alterar('fimGestao', event.target.value)}
              required
              aria-invalid={errosCampos.fimGestao ? true : undefined}
            />
            {errosCampos.fimGestao && <small role="alert">{errosCampos.fimGestao}</small>}
          </label>
        </div>

        {erro && <p role="alert">{erro}</p>}

        <button type="submit" disabled={salvando}>
          {salvando ? 'Salvando...' : editar ? 'Salvar alterações' : 'Criar organização'}
        </button>
      </form>
    </main>
  );
}
