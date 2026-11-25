import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../lib/httpClient';
import { useTituloPagina } from '../lib/useTituloPagina';

interface UserResponse {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

interface FormValues {
  nome: string;
  email: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validar(values: FormValues): FieldErrors {
  const erros: FieldErrors = {};

  if (!values.nome.trim()) erros.nome = 'Informe o nome do usuário.';
  if (!values.email.trim()) {
    erros.email = 'Informe o e-mail do usuário.';
  } else if (!emailValido(values.email)) {
    erros.email = 'Informe um e-mail válido.';
  }

  return erros;
}

export function UserEditPage() {
  useTituloPagina('Editar usuário');

  const { id } = useParams<{ id: string }>();
  const [usuario, setUsuario] = useState<UserResponse | null>(null);
  const [values, setValues] = useState<FormValues>({ nome: '', email: '' });
  const [errosCampos, setErrosCampos] = useState<FieldErrors>({});
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!id) {
      setErroCarregamento('Usuário não encontrado.');
      setCarregando(false);
      return;
    }

    let cancelado = false;

    async function carregar() {
      try {
        const dados = await apiRequest<UserResponse>(`/users/${id}`);
        if (cancelado) return;

        setUsuario(dados);
        setValues({ nome: dados.name, email: dados.email });
      } catch (error) {
        if (!cancelado) {
          setErroCarregamento(
            error instanceof ApiError ? error.message : 'Não foi possível carregar o usuário.',
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

  function alterar(campo: keyof FormValues, valor: string) {
    setValues((atuais) => ({ ...atuais, [campo]: valor }));
    setErrosCampos((atuais) => ({ ...atuais, [campo]: undefined }));
    setErro(null);
    setMensagem(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !usuario) return;

    const proximosErros = validar(values);
    setErrosCampos(proximosErros);
    setErro(null);
    setMensagem(null);

    if (Object.keys(proximosErros).length > 0) return;

    setSalvando(true);

    try {
      const atualizado = await apiRequest<UserResponse>(`/users/${id}`, {
        method: 'PUT',
        body: {
          name: values.nome.trim(),
          email: values.email.trim(),
        },
      });

      setUsuario(atualizado);
      setValues({ nome: atualizado.name, email: atualizado.email });
      setErrosCampos({});
      setMensagem('Dados do usuário atualizados com sucesso.');
    } catch (error) {
      if (error instanceof ApiError) {
        setErro(error.message);
        setErrosCampos((atuais) => ({ ...atuais, ...error.fields }));
      } else {
        setErro('Não foi possível atualizar o usuário.');
      }
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <main>
        <p role="status">Carregando usuário...</p>
      </main>
    );
  }

  if (!id || erroCarregamento || !usuario) {
    return (
      <main>
        <h1>Editar usuário</h1>
        <p role="alert">{erroCarregamento ?? 'Usuário não encontrado.'}</p>
        <p>
          <Link to="/organizacao/membros">Voltar para membros</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <div className="cabecalho-pagina">
        <div>
          <h1>Editar usuário</h1>
          <p className="cabecalho-pagina__apoio">
            Atualize nome e e-mail sem alterar o histórico de lançamentos.
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
            disabled={salvando}
            aria-invalid={errosCampos.nome ? true : undefined}
          />
          {errosCampos.nome && <small role="alert">{errosCampos.nome}</small>}
        </label>

        <label>
          E-mail
          <input
            type="email"
            value={values.email}
            onChange={(event) => alterar('email', event.target.value)}
            maxLength={150}
            required
            autoComplete="email"
            disabled={salvando}
            aria-invalid={errosCampos.email ? true : undefined}
          />
          {errosCampos.email && <small role="alert">{errosCampos.email}</small>}
        </label>

        {erro && <p role="alert">{erro}</p>}
        {mensagem && <p role="status">{mensagem}</p>}

        <div className="acoes">
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
          <Link className="acao" data-variante="secundario" to="/organizacao/membros">
            Cancelar
          </Link>
        </div>
      </form>
    </main>
  );
}
