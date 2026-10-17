import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { AppFooter, AppHeader } from '../components/AppHeader';
import { ApiError, apiRequest } from '../lib/httpClient';
import { useTituloPagina } from '../lib/useTituloPagina';

interface PasswordResetResponse {
  mensagem: string;
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function ForgotPasswordPage() {
  useTituloPagina('Recuperar senha');

  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setMensagem(null);

    if (!emailValido(email)) {
      setErro('Informe um e-mail válido.');
      return;
    }

    setEnviando(true);

    try {
      const resposta = await apiRequest<PasswordResetResponse>('/auth/senha/solicitar', {
        method: 'POST',
        auth: false,
        body: { email: email.trim() },
      });

      setMensagem(resposta.mensagem);
    } catch (error) {
      setErro(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível solicitar a recuperação.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <AppHeader />

      <main>
        <h1>Esqueci minha senha</h1>
        <p>
          Informe o e-mail usado no cadastro. Se houver uma conta, enviaremos um link para criar
          uma nova senha.
        </p>

        <form onSubmit={handleSubmit} noValidate className="formulario-coluna">
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErro(null);
              }}
              required
              disabled={enviando}
              autoComplete="email"
              aria-invalid={erro ? true : undefined}
            />
            {erro && <small role="alert">{erro}</small>}
          </label>

          {mensagem && <p role="status">{mensagem}</p>}

          <button type="submit" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar link de recuperação'}
          </button>
        </form>

        <p>
          <Link to="/login">Voltar para o login</Link>
        </p>
      </main>

      <AppFooter />
    </>
  );
}
