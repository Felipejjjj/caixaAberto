import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { rotuloPapel } from '../lib/formato';
import { ApiError, apiRequest } from '../lib/httpClient';
import { useTituloPagina } from '../lib/useTituloPagina';

type Papel = 'CONSULTOR' | 'TESOUREIRO';

interface FormValues {
  nome: string;
  email: string;
  senha: string;
  confirmacao: string;
  papel: Papel;
}

type FieldErrors = Partial<Record<Exclude<keyof FormValues, 'papel'>, string>>;

const PAPEIS: Papel[] = ['CONSULTOR', 'TESOUREIRO'];

const VALORES_VAZIOS: FormValues = {
  nome: '',
  email: '',
  senha: '',
  confirmacao: '',
  papel: 'CONSULTOR',
};

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
  if (values.senha.length < 8) erros.senha = 'A senha deve ter no mínimo 8 caracteres.';
  if (values.senha !== values.confirmacao) {
    erros.confirmacao = 'A confirmação da senha não confere.';
  }

  return erros;
}

export function UserRegistrationPage() {
  useTituloPagina('Cadastrar usuário');

  const [values, setValues] = useState<FormValues>(VALORES_VAZIOS);
  const [errosCampos, setErrosCampos] = useState<FieldErrors>({});
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function alterar(campo: keyof FormValues, valor: string) {
    setValues((atuais) => ({ ...atuais, [campo]: valor }));
    if (campo !== 'papel') setErrosCampos((atuais) => ({ ...atuais, [campo]: undefined }));
    setErro(null);
    setMensagem(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const proximosErros = validar(values);
    setErrosCampos(proximosErros);
    setErro(null);
    setMensagem(null);

    if (Object.keys(proximosErros).length > 0) return;

    setSalvando(true);

    try {
      await apiRequest('/users', {
        method: 'POST',
        body: {
          name: values.nome.trim(),
          email: values.email.trim(),
          password: values.senha,
          papel: values.papel,
        },
      });

      setValues(VALORES_VAZIOS);
      setErrosCampos({});
      setMensagem(
        `Conta de ${values.nome.trim()} criada e vinculada à organização como ${rotuloPapel(values.papel).toLowerCase()}.`,
      );
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível cadastrar o usuário.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main>
      <div className="cabecalho-pagina">
        <div>
          <h1>Cadastrar usuário</h1>
          <p className="cabecalho-pagina__apoio">
            A conta é criada já vinculada a esta organização. Para dar acesso a quem já tem conta,
            use o vínculo por e-mail na tela de membros.
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
            required
            maxLength={150}
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
            required
            autoComplete="email"
            disabled={salvando}
            aria-invalid={errosCampos.email ? true : undefined}
          />
          {errosCampos.email && <small role="alert">{errosCampos.email}</small>}
        </label>

        <label>
          Senha
          <input
            type="password"
            value={values.senha}
            onChange={(event) => alterar('senha', event.target.value)}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            disabled={salvando}
            aria-invalid={errosCampos.senha ? true : undefined}
          />
          {errosCampos.senha && <small role="alert">{errosCampos.senha}</small>}
        </label>

        <label>
          Confirmar senha
          <input
            type="password"
            value={values.confirmacao}
            onChange={(event) => alterar('confirmacao', event.target.value)}
            required
            autoComplete="new-password"
            disabled={salvando}
            aria-invalid={errosCampos.confirmacao ? true : undefined}
          />
          {errosCampos.confirmacao && <small role="alert">{errosCampos.confirmacao}</small>}
        </label>

        <label>
          Papel na organização
          <select
            value={values.papel}
            onChange={(event) => alterar('papel', event.target.value)}
            disabled={salvando}
          >
            {PAPEIS.map((papel) => (
              <option key={papel} value={papel}>
                {rotuloPapel(papel)}
              </option>
            ))}
          </select>
        </label>

        {erro && <p role="alert">{erro}</p>}
        {mensagem && <p role="status">{mensagem}</p>}

        <button type="submit" disabled={salvando}>
          {salvando ? 'Cadastrando...' : 'Cadastrar usuário'}
        </button>
      </form>

      <p>
        <Link to="/organizacao/membros">Voltar para membros</Link>
      </p>
    </main>
  );
}
