import { z } from 'zod';

import { roles } from '../domain/auth-context.js';

// Limites das colunas de USUARIO. A senha para em 72 porque o bcrypt ignora o que passa disso, e
// duas senhas diferentes depois do 72o caractere virariam a mesma.
export const newAccountSchema = z.object({
  name: z
    .string({ error: 'Informe o nome' })
    .trim()
    .min(1, 'Informe o nome')
    .max(150, 'O nome deve ter no máximo 150 caracteres'),
  email: z
    .string({ error: 'Informe o e-mail' })
    .trim()
    .max(150, 'O e-mail deve ter no máximo 150 caracteres')
    .pipe(z.email('Informe um e-mail válido')),
  password: z
    .string({ error: 'Informe a senha' })
    .min(8, 'A senha deve ter no mínimo 8 caracteres')
    .max(72, 'A senha deve ter no máximo 72 caracteres'),
  // Como no vinculo por e-mail, a conta nova entra como consultor se nada for dito.
  papel: z.enum(roles).default('CONSULTOR'),
});

export type NewAccountInput = z.infer<typeof newAccountSchema>;
