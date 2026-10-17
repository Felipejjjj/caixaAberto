import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AppFooter, AppHeader } from '../components/AppHeader';
import { ApiError, apiRequest } from '../lib/httpClient';
import { useTituloPagina } from '../lib/useTituloPagina';

interface PasswordResetResponse {
  mensagem: string;
}

function tamanhoEmBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function ResetPasswordPage() {
  useTituloPagina('Criar nova senha');

  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setMensagem(null);

    if (!token) {
      setErro('O link de redefinição é inválido ou está incompleto.');
      return;
    }

    if (novaSenha.length < 8) {
      setErro('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (tamanhoEmBytes(novaSenha) > 72) {
      setErro('A senha deve ter no máximo 72 bytes.');
      return;
    }

    if (novaSenha !== confirmacao) {
      setErro('A confirmação da senha não confere.');
      return;
    }

    setEnviando(true);

    try {
      const resposta = await apiRequest<PasswordResetResponse>('/auth/senha/redefinir', {
        method: 'POST',
        auth: false,
        body: { token, novaSenha },
      });

      setMensagem(resposta.mensagem);
      setNovaSenha('');
      setConfirmacao('');
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível redefinir a senha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <AppHeader />

      <main>
        <h1>Nova senha</h1>

        {!token ? (
          <>
            <p role="alert">O link de redefinição é inválido ou está incompleto.</p>
            <p>
              <Link to="/esqueci-senha">Solicitar um novo link</Link>
            </p>
          </>
        ) : mensagem ? (
          <>
            <p role="status">{mensagem}</p>
            <p>
              <Link to="/login">Entrar com a nova senha</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="formulario-coluna">
            <label>
              Nova senha
              <input
                type="password"
                value={novaSenha}
                onChange={(event) => {
                  setNovaSenha(event.target.value);
                  setErro(null);
                }}
                required
                minLength={8}
                maxLength={72}
                disabled={enviando}
                autoComplete="new-password"
                aria-invalid={erro ? true : undefined}
              />
            </label>

            <label>
              Confirmar nova senha
              <input
                type="password"
                value={confirmacao}
                onChange={(event) => {
                  setConfirmacao(event.target.value);
                  setErro(null);
                }}
                required
                disabled={enviando}
                autoComplete="new-password"
                aria-invalid={erro ? true : undefined}
              />
            </label>

            {erro && <p role="alert">{erro}</p>}

            <button type="submit" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Definir nova senha'}
            </button>
          </form>
        )}

        {!mensagem && token && (
          <p>
            <Link to="/login">Voltar para o login</Link>
          </p>
        )}
      </main>

      <AppFooter />
    </>
  );
}
