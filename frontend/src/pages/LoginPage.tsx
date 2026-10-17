import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppFooter, AppHeader } from '../components/AppHeader';
import { ApiError, apiRequest } from '../lib/httpClient';
import { clearSession, setToken } from '../lib/session';
import { useTituloPagina } from '../lib/useTituloPagina';

interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

// A API hospedada hiberna depois de 15 minutos parada e a primeira requisicao leva
// perto de um minuto. Sem aviso, a tela parece travada logo no primeiro contato.
const ESPERA_ATE_AVISAR_MS = 5000;

export function LoginPage() {
  useTituloPagina('Entrar');

  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [servidorAcordando, setServidorAcordando] = useState(false);

  useEffect(() => {
    if (!enviando) {
      return;
    }

    const temporizador = setTimeout(() => setServidorAcordando(true), ESPERA_ATE_AVISAR_MS);

    return () => clearTimeout(temporizador);
  }, [enviando]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setServidorAcordando(false);
    setEnviando(true);

    try {
      const resposta = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email,
          password: senha,
        },
      });

      clearSession();
      setToken(resposta.token);

      navigate('/lancamentos', { replace: true });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível entrar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <AppHeader />

      <main>
        <h1>Entrar</h1>
        <p>Acesse o caixa da sua organização para registrar e consultar lançamentos.</p>

        <form onSubmit={handleSubmit} className="formulario-coluna">
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={enviando}
              autoComplete="email"
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              required
              disabled={enviando}
              autoComplete="current-password"
            />
          </label>

          {erro && <p role="alert">{erro}</p>}

          {servidorAcordando && (
            <p role="status">
              O servidor estava em repouso e está sendo acionado. A primeira entrada do dia pode
              levar até um minuto.
            </p>
          )}

          <button type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </main>

      <AppFooter />
    </>
  );
}
