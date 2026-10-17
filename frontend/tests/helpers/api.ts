import { vi } from 'vitest';

export interface ChamadaRegistrada {
  url: string;
  method: string;
  body: unknown;
}

interface RespostaConfigurada {
  status?: number;
  body?: unknown;
}

type Rotas = Record<string, RespostaConfigurada>;

// O fetch global e substituido em vez de se trocar o modulo httpClient: assim o corpo enviado a API
// e observado como ele sai do navegador. Um valor que o formulario deixa de normalizar aparece aqui
// do mesmo jeito que apareceria no servidor.
export function stubApi(rotas: Rotas) {
  const chamadas: ChamadaRegistrada[] = [];

  const fetchFalso = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const corpo = init?.body;

    chamadas.push({
      url,
      method,
      body: typeof corpo === 'string' ? JSON.parse(corpo) : corpo,
    });

    const chave = Object.keys(rotas).find((rota) => url.includes(rota));
    const resposta = chave
      ? rotas[chave]!
      : { status: 404, body: { erro: 'Rota nao configurada' } };
    const status = resposta.status ?? 200;

    // Response com status 204/205/304 nao pode ter corpo: o fetch nativo rejeita a
    // construcao quando ha corpo nesses casos, mesmo um objeto vazio serializado.
    const semCorpo = status === 204 || status === 205 || status === 304;
    const corpoResposta = 'body' in resposta ? resposta.body : {};

    return new Response(semCorpo ? null : JSON.stringify(corpoResposta), {
      status,
      headers: semCorpo ? undefined : { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchFalso);

  return {
    chamadas,
    chamadasPara(trecho: string) {
      return chamadas.filter((chamada) => chamada.url.includes(trecho));
    },
  };
}

export function autenticar(papel: 'TESOUREIRO' | 'CONSULTOR' = 'TESOUREIRO') {
  localStorage.setItem('caixaAberto.token', 'token-de-teste');
  localStorage.setItem('caixaAberto.papel', papel);
}
