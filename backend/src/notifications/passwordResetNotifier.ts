export interface PasswordResetMessage {
  name: string;
  email: string;
  link: string;
  expiresAt: Date;
}

export interface PasswordResetNotifier {
  send(message: PasswordResetMessage): Promise<void>;
}

// A proposta deixa notificacao por e-mail fora do escopo, entao por enquanto o link vai para o log
// do servidor. Enviar e-mail de verdade e trocar esta implementacao, sem tocar no servico: as regras
// do token nao dependem de como o link chega a pessoa.
const logNotifier: PasswordResetNotifier = {
  async send(message) {
    console.info(
      `[redefinicao de senha] link para ${message.email}, valido ate ${message.expiresAt.toISOString()}: ${message.link}`,
    );
  },
};

export const passwordResetNotifier: PasswordResetNotifier = logNotifier;
