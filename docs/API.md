# Contrato da API: Sprint 1

Base local: `http://localhost:3000`. O conteúdo JSON usa UTF-8. Datas civis usam `YYYY-MM-DD`,
timestamps usam ISO 8601 e valores monetários e IDs `BIGINT` são strings.

## Convenções comuns

As rotas e propriedades públicas da API usam português. Rotas autenticadas recebem o contexto
resolvido pelo servidor a partir do JWT e do vínculo ativo em `MEMBRO`:

```ts
req.contexto = {
  usuarioId: bigint,
  organizacaoId: bigint,
  papel: 'TESOUREIRO' | 'CONSULTOR',
};
```

Quando o usuário possui mais de um vínculo ativo, o cliente seleciona um deles pelo cabeçalho:

```http
X-Organization-Id: 2
```

Sem o cabeçalho, a API retorna `400`. Uma organização sem vínculo ativo com o usuário retorna `403`.
O cliente não envia `organizacaoId` no corpo ou na query dos casos de uso autenticados.

Parâmetros de query e propriedades de corpo não reconhecidos são rejeitados com `400`, em vez
de serem ignorados em silêncio.

Durante testes de integração, e somente em `NODE_ENV=test`, o contexto pode ser injetado por:

```http
X-Test-Context: {"usuarioId":"1","organizacaoId":"2","papel":"TESOUREIRO"}
```

Erros seguem o formato:

```json
{
  "erro": "Mensagem em português",
  "campos": {
    "campo": "Motivo da rejeição"
  }
}
```

`campos` é opcional. Respostas não incluem stack trace. Recursos de outra organização são tratados
como inexistentes (`404`) quando revelar sua presença constituiria vazamento de dados.

## Compatibilidade temporária

Alguns routers existentes ainda expõem caminhos e campos em inglês. Eles não alteram o contrato
canônico definido neste documento e serão migrados em trabalho próprio:

- `/users` ainda responde no lugar de `/usuarios`;
- `/transactions` ainda responde no lugar de `/lancamentos`;
- `/transactions/resumo/mensal` ainda responde no lugar de `/resumos/mensal`;
- `/transparency/:publicLink` ainda responde no lugar de `/publico/{token}`;
- essas rotas ainda recebem ou devolvem propriedades como `name`, `password`, `user`,
  `categoryId`, `amount`, `description`, `source` e `recipient`.

Até a migração ser concluída, clientes que consumirem os caminhos temporários devem considerar que
eles ainda não cumprem integralmente os formatos abaixo.

## Infraestrutura

### `GET /health`

Não exige autenticação.

Sucesso `200`:

```json
{ "status": "ok" }
```

## Autenticação

### `POST /auth/login`

Não exige autenticação.

Request:

```json
{ "email": "tesoureiro@exemplo.com", "senha": "senha" }
```

Sucesso `200`:

```json
{
  "token": "jwt",
  "usuario": {
    "id": "1",
    "nome": "Ana",
    "email": "tesoureiro@exemplo.com",
    "ativo": true
  },
  "organizacoes": [{ "id": "2", "nome": "Comissão", "papel": "TESOUREIRO" }]
}
```

Erros:

- `400`: campos obrigatórios ausentes ou inválidos;
- `401`: credenciais inválidas;
- `403`: usuário inativo.

Compatibilidade atual: o endpoint ainda espera `password` e devolve `user` com propriedades em
inglês.

### `POST /auth/logout`

Exige autenticação.

Sucesso `204`, sem corpo.

Erros:

- `401`: token ausente, inválido ou expirado, ou já encerrado por um logout anterior.

O token apresentado é registrado como revogado até a data em que expiraria, então não volta a ser
aceito depois da saída.

### `POST /auth/senha/solicitar`

Não exige autenticação. Gera um link de redefinição para o e-mail informado. A comparação do e-mail
não diferencia maiúsculas nem espaços nas pontas.

Request:

```json
{ "email": "ana@example.test" }
```

Sucesso `202`, sempre com a mesma mensagem, exista o e-mail ou não:

```json
{ "mensagem": "Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha." }
```

E-mail desconhecido e conta inativa não geram link, mas recebem a mesma resposta, para a tela não
revelar quais e-mails têm conta. O link tem o formato `{CORS_ORIGIN}/redefinir-senha?token=...`,
vale por 60 minutos e por um uso. Um pedido novo invalida o link anterior. Por enquanto o link é
registrado no log do servidor, sem envio de e-mail (ver `docs/DECISIONS.md`).

Erros:

- `400`: e-mail inválido ou propriedade não reconhecida.

### `POST /auth/senha/redefinir`

Não exige autenticação. Troca a senha usando o token do link.

Request:

```json
{ "token": "valor-do-parametro-token-do-link", "novaSenha": "novaSenha@456" }
```

Sucesso `200`:

```json
{ "mensagem": "Senha redefinida. Entre com a nova senha." }
```

A nova senha tem de 8 caracteres a 72 bytes, o limite do bcrypt. Depois da troca, a senha antiga
deixa de funcionar no login e as sessões abertas antes dela são encerradas: qualquer rota
autenticada passa a responder `401` com `Sessão encerrada pela troca de senha. Entre novamente.`
para esses tokens. Uma senha recusada não consome o link.

Erros:

- `400`: senha fora do tamanho, propriedade não reconhecida, ou token inexistente, expirado, já
  usado ou de conta inativa, este com a mensagem
  `Link de redefinição inválido ou expirado. Solicite um novo.`

## Usuários

### `GET /usuarios`

Exige autenticação e papel `TESOUREIRO`.

Sucesso `200`:

```json
{
  "dados": [
    {
      "id": "1",
      "nome": "Ana",
      "email": "ana@exemplo.com",
      "ativo": true,
      "dataCriacao": "2026-09-01T12:00:00.000Z"
    }
  ]
}
```

Erros:

- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão.

Compatibilidade atual: responde em `GET /users` e devolve um array com propriedades em inglês.

### `GET /usuarios/{id}`

Exige autenticação e papel `TESOUREIRO`.

Sucesso `200` devolve o mesmo objeto de usuário da listagem.

Erros:

- `400`: ID inválido;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão;
- `404`: usuário inexistente.

Compatibilidade atual: responde em `GET /users/:id` com propriedades em inglês.

### `POST /usuarios`

Exige autenticação e papel `TESOUREIRO`.

Request:

```json
{
  "nome": "Ana",
  "email": "ana@exemplo.com",
  "senha": "senha-segura",
  "ativo": true
}
```

Sucesso `201` devolve o usuário criado sem o hash da senha.

Erros:

- `400`: dados inválidos ou e-mail já cadastrado;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão.

Compatibilidade atual: `POST /users` usa propriedades em inglês. Também existe temporariamente
`POST /auth/register`, sem autenticação; seu destino será definido em trabalho próprio.

### `PUT /usuarios/{id}`

Exige autenticação e papel `TESOUREIRO`. Aceita os mesmos campos de `POST /usuarios`, todos
opcionais.

A conta é única no sistema, mas o tesoureiro responde só pela própria organização. Por isso:

- a senha só é alterada pelo próprio usuário. Como a rota exige `TESOUREIRO`, o consultor ainda
  não tem como trocar a própria senha;
- nome, e-mail e situação de quem tem vínculo ativo em outra organização também só são alterados
  pelo próprio usuário;
- ninguém inativa a própria conta por aqui, já que depois não conseguiria entrar para desfazer.

Sucesso `200` devolve o usuário atualizado sem o hash da senha.

Erros:

- `400`: ID ou dados inválidos, ou e-mail já cadastrado;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão, senha de outro usuário, ou conta de quem participa de outra
  organização;
- `404`: usuário inexistente.

Compatibilidade atual: responde em `PUT /users/:id` com request e response em inglês.

## Organizações do usuário autenticado

### `GET /users/me/organizacoes`

Exige autenticação, mas não exige `X-Organization-Id`. Retorna as organizações em que o usuário
autenticado possui vínculo ativo, ordenadas pelo nome. Vínculos inativos não aparecem; usuários sem
vínculos ativos recebem uma lista vazia.

Sucesso `200`:

```json
{
  "dados": [
    {
      "vinculoId": "12",
      "papel": "CONSULTOR",
      "dataVinculo": "2026-09-24",
      "organizacao": {
        "id": "2",
        "nome": "Comissão",
        "descricao": "Caixa da comissão",
        "inicioGestao": "2026-01-01",
        "fimGestao": "2026-12-31",
        "linkPublico": null,
        "transparenciaAtiva": false
      }
    }
  ]
}
```

Erros:

- `401`: autenticação ausente ou inválida;
- `500`: falha ao consultar as organizações.

## Membros

As rotas de consulta e vínculo trazem a organização no caminho. O `{id}` precisa ser a organização
do contexto, resolvida pelo login e por `X-Organization-Id`; qualquer outra responde `404`, sem
revelar se ela existe. A alteração de papel usa o ID do vínculo retornado pela listagem, não o ID do usuário.

### `GET /organizacoes/{id}/membros`

Exige autenticação. Qualquer membro com vínculo ativo consulta. Retorna só os vínculos ativos da
organização, ordenados pelo nome do usuário.

Sucesso `200`:

```json
{
  "dados": [
    {
      "id": "12",
      "usuario": { "id": "5", "nome": "Maria", "email": "maria@grupo.org" },
      "papel": "CONSULTOR",
      "dataVinculo": "2026-09-24",
      "ativo": true
    }
  ]
}
```

Erros:

- `400`: ID inválido ou parâmetro de consulta não reconhecido;
- `401`: autenticação ausente ou inválida;
- `403`: usuário sem vínculo ativo;
- `404`: organização diferente da do contexto.

### `POST /organizacoes/{id}/membros`

Exige autenticação e papel `TESOUREIRO`. Vincula um usuário já cadastrado, identificado pelo
e-mail. O vínculo nasce ativo, com papel `CONSULTOR` e a data de hoje no fuso da aplicação
(`America/Fortaleza`). Quem já teve vínculo desativado volta pelo mesmo registro, reativado com
papel `CONSULTOR` e a data de hoje. Conta inativa não é vinculada: com vínculo ativo em duas
organizações, nenhum tesoureiro conseguiria reativá-la.

Request:

```json
{ "email": "maria@grupo.org" }
```

Sucesso `201`:

```json
{
  "id": "12",
  "usuario": { "id": "5", "nome": "Maria", "email": "maria@grupo.org" },
  "papel": "CONSULTOR",
  "dataVinculo": "2026-09-24",
  "ativo": true
}
```

Erros:

- `400`: ID ou e-mail inválido, ou propriedade não reconhecida no corpo;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `404`: organização diferente da do contexto, ou e-mail sem usuário cadastrado;
- `409`: usuário já é membro ativo da organização, ou conta inativa.

### `PUT /membros/{id}/papel`

Exige autenticação e papel `TESOUREIRO`. `{id}` é o ID do vínculo do membro na organização,
conforme retornado por `GET /organizacoes/{id}/membros`.

Request:

```json
{ "papel": "TESOUREIRO" }
```

Aceita `TESOUREIRO` ou `CONSULTOR`. A organização não pode ficar sem tesoureiro ativo: a tentativa
de rebaixar o último responde `409`. A verificação e a alteração são feitas de forma transacional,
para impedir rebaixamentos simultâneos que deixem a organização sem tesoureiro.

Sucesso `200`: devolve o vínculo atualizado.

Erros:

- `400`: ID ou papel inválido, ou propriedade não reconhecida;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `404`: vínculo ausente, inativo ou pertencente a outra organização;
- `409`: tentativa de rebaixar o último tesoureiro ativo ou conflito concorrente.

## Categorias

### `GET /categorias`

Exige autenticação. Query opcional: `tipo=ENTRADA|SAIDA`. Retorna somente categorias ativas da
organização do contexto, ordenadas por nome.

Sucesso `200`:

```json
{
  "dados": [{ "id": "10", "nome": "Alimentação", "tipo": "SAIDA" }]
}
```

Erros:

- `400`: tipo inválido;
- `401`: autenticação ausente ou inválida;
- `403`: usuário sem vínculo ativo.

### `POST /categorias`

Exige autenticação e papel `TESOUREIRO`. Cadastra uma categoria ativa na organização do contexto.
`descricao` é opcional e, quando omitida, é gravada vazia.

Request:

```json
{ "nome": "Transporte", "descricao": "Ônibus e combustível", "tipo": "SAIDA" }
```

Sucesso `201`:

```json
{ "id": "11", "nome": "Transporte", "descricao": "Ônibus e combustível", "tipo": "SAIDA" }
```

O nome não pode repetir o de outra categoria do mesmo tipo na organização. A comparação não
diferencia maiúsculas nem espaços nas pontas, e vale também contra categoria desativada, cujo nome
continua ocupado.

Erros:

- `400`: dados inválidos ou propriedade não reconhecida no corpo;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `409`: já existe categoria com esse nome e tipo, ativa ou desativada.

### `PUT /categorias/{id}`

Exige autenticação e papel `TESOUREIRO`. Aceita os mesmos campos de `POST /categorias`, todos
opcionais, e pelo menos um deles. Os lançamentos guardam a categoria pelo ID, então um novo nome já
aparece no histórico, sem alterar nenhum valor.

O nome segue a mesma regra do cadastro, sem contar a própria categoria. O tipo só pode mudar
enquanto nenhum lançamento usa a categoria. Desativar não é feito aqui, e sim por
`DELETE /categorias/{id}`.

Sucesso `200` devolve a categoria no formato do cadastro.

Erros:

- `400`: ID inválido, corpo sem campos ou propriedade não reconhecida no corpo;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `404`: categoria inexistente, desativada ou de outra organização;
- `409`: nome já usado por outra categoria do mesmo tipo, ou troca de tipo de categoria com
  lançamentos.

### `DELETE /categorias/{id}`

Exige autenticação e papel `TESOUREIRO`. A exclusão é lógica: a categoria passa a inativa, some de
`GET /categorias` e deixa de aceitar lançamentos novos. Os lançamentos que já a usam continuam
exibindo o nome dela, e o relatório por categoria segue somando o que foi registrado nela.

Sucesso `204`, sem corpo.

Erros:

- `400`: ID inválido;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `404`: categoria inexistente, já desativada ou de outra organização.

## Lançamentos

### `POST /lancamentos`

Exige autenticação e papel `TESOUREIRO`.

Request:

```json
{
  "categoriaId": "10",
  "valor": "200.00",
  "data": "2026-09-01",
  "tipo": "ENTRADA",
  "descricao": "Contribuições de setembro",
  "origem": "Turma 2026",
  "destinatario": null
}
```

Para `SAIDA`, `destinatario` é preenchido e `origem` é nulo. Sucesso `201` devolve o lançamento.

Erros:

- `400`: dados inválidos ou categoria inativa/incompatível;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `404`: categoria inexistente na organização do contexto.

Compatibilidade atual: responde em `POST /transactions` e recebe campos em inglês.

### `GET /lancamentos`

Exige autenticação. Queries opcionais: `dataInicio`, `dataFim`, `tipo`, `categoriaId`, `usuarioId`,
`pagina` (padrão `1`) e `tamanhoPagina` (padrão `20`, máximo `100`). Ordenação: `data DESC`,
`id DESC`.

Sucesso `200`:

```json
{
  "dados": [
    {
      "id": "30",
      "data": "2026-09-02",
      "descricao": "Compra de material",
      "categoria": { "id": "10", "nome": "Material" },
      "valor": "50.00",
      "tipo": "SAIDA",
      "status": "ATIVO",
      "possuiComprovante": true
    }
  ],
  "paginacao": { "pagina": 1, "tamanhoPagina": 20, "total": 1, "totalPaginas": 1 }
}
```

Um resultado vazio devolve `total` e `totalPaginas` iguais a zero.

Erros:

- `400`: filtros ou período inválidos;
- `401`: autenticação ausente ou inválida;
- `403`: usuário sem vínculo ativo.

### `GET /lancamentos/{id}`

Exige autenticação. Retorna os dados completos do lançamento, responsável, categoria e metadados
do comprovante.

Sucesso `200`:

```json
{
  "id": "30",
  "data": "2026-09-02",
  "tipo": "SAIDA",
  "valor": "50.00",
  "descricao": "Compra de material",
  "origem": null,
  "destinatario": "Papelaria Exemplo",
  "status": "ATIVO",
  "categoria": { "id": "10", "nome": "Material", "tipo": "SAIDA" },
  "responsavel": { "id": "1", "nome": "Ana" },
  "comprovante": null
}
```

Erros:

- `400`: ID inválido;
- `401`: autenticação ausente ou inválida;
- `403`: usuário sem vínculo ativo;
- `404`: lançamento ausente ou pertencente a outra organização.

Compatibilidade atual: responde em `GET /transactions/:id` e devolve propriedades em inglês.

### `PUT /lancamentos/{id}`

Exige autenticação e papel `TESOUREIRO`. Atualiza parcialmente `categoryId`, `amount`, `date`,
`description`, `source` e `recipient`. O tipo (`type`/`tipo`), o responsável e a organização não
são editáveis. A data é validada dentro do período de gestão quando enviada; alterações em outros
campos preservam a data já registrada. Lançamentos estornados não podem ser alterados.

Sucesso `200`: devolve o lançamento atualizado.

Erros:

- `400`: ID, campos, valores ou data inválidos;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `404`: lançamento ausente ou pertencente a outra organização;
- `409`: lançamento estornado ou conflito ao atualizar.

Compatibilidade atual: responde em `PUT /transactions/:id`, recebe e devolve propriedades em inglês.

### `POST /lancamentos/{id}/comprovante`

Exige autenticação e papel `TESOUREIRO`. O conteúdo é `multipart/form-data`, no campo `arquivo`.
São aceitos JPEG, PNG, WebP e PDF, verificados pelo conteúdo real, até o limite configurado em
`UPLOAD_MAX_BYTES`.

Sucesso `201`:

```json
{
  "id": "40",
  "lancamentoId": "30",
  "nomeArquivo": "nota.pdf",
  "tipoArquivo": "application/pdf",
  "tamanho": "1258291",
  "url": "/lancamentos/30/comprovante"
}
```

Erros:

- `400`: formato ou tamanho inválido;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão;
- `404`: lançamento ausente ou pertencente a outra organização;
- `409`: lançamento já possui comprovante.

### `GET /lancamentos/{id}/comprovante`

Exige autenticação. No armazenamento local, devolve o conteúdo com `Content-Type` e
`Content-Disposition`. Um armazenamento remoto pode redirecionar para uma URL temporária.

Erros:

- `400`: ID inválido;
- `401`: autenticação ausente ou inválida;
- `403`: usuário sem vínculo ativo;
- `404`: comprovante ou lançamento ausente na organização do contexto.

### `POST /lancamentos/{id}/estorno`

Exige autenticação e papel `TESOUREIRO`. Não recebe dados; propriedades enviadas no corpo são
rejeitadas com `400`. Só um lançamento `ATIVO` pode ser estornado.

O estorno não apaga o lançamento. Ele continua na listagem, no detalhe e no extrato com status
`ESTORNADO`, e deixa de compor o saldo do extrato, o relatório por categoria, o resumo mensal e a
transparência pública.

Sucesso `200`:

```json
{ "id": "30", "status": "ESTORNADO", "dataEstorno": "2026-09-24T18:30:00.000Z" }
```

Erros:

- `400`: ID inválido ou propriedade não reconhecida no corpo;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `404`: lançamento ausente ou pertencente a outra organização;
- `409`: lançamento já estornado.

## Extrato e painéis

### `GET /extrato`

Exige autenticação. `dataInicio` e `dataFim` são obrigatórios.

Sucesso `200`:

```json
{
  "dataInicio": "2026-09-01",
  "dataFim": "2026-09-30",
  "saldoAnterior": "0.00",
  "linhas": [
    {
      "id": "20",
      "data": "2026-09-01",
      "tipo": "ENTRADA",
      "valor": "200.00",
      "categoria": { "id": "4", "nome": "Mensalidades" },
      "descricao": "Contribuições",
      "status": "ATIVO",
      "saldoAcumulado": "200.00"
    }
  ],
  "saldoFinal": "200.00"
}
```

Linhas são ordenadas por `data ASC`, `id ASC`. Estornados aparecem, mas não alteram o saldo.

Erros:

- `400`: período ausente ou inválido;
- `401`: autenticação ausente ou inválida;
- `403`: usuário sem vínculo ativo.

### `GET /relatorios/categorias`

Exige autenticação. `dataInicio` e `dataFim` são obrigatórios. Lançamentos estornados são ignorados.

Sucesso `200`:

```json
{
  "dataInicio": "2026-09-01",
  "dataFim": "2026-09-30",
  "categorias": [{ "id": "10", "nome": "Material", "tipo": "SAIDA", "total": "300.00" }],
  "totais": { "entradas": "0.00", "saidas": "300.00" }
}
```

A lista traz apenas as categorias com lançamentos ativos no período, ordenadas por tipo, depois por
total decrescente e, no empate, por nome. Uma categoria desativada aparece se teve movimentação no
período.

Erros:

- `400`: período ausente ou inválido;
- `401`: autenticação ausente ou inválida;
- `403`: usuário sem vínculo ativo.

### `GET /resumos/mensal`

Exige autenticação. Query obrigatória: `mes=YYYY-MM`. Os valores são sempre isolados pela
organização do contexto.

Sucesso `200`:

```json
{
  "mes": "2026-09",
  "saldoInicial": "100.00",
  "entradas": "500.00",
  "saidas": "200.00",
  "saldoFinal": "400.00"
}
```

Erros:

- `400`: mês ausente ou inválido;
- `401`: autenticação ausente ou inválida;
- `403`: usuário sem vínculo ativo.

Compatibilidade atual: responde em `GET /transactions/resumo/mensal` e devolve `month`,
`entries`, `exits`, `balance` e `previousMonth`.

## Organizações

### `POST /organizacoes`

Exige autenticação, mas não exige vínculo nem `X-Organization-Id`: é por ela que um usuário sem
organização começa. Cria a organização e vincula o criador como `TESOUREIRO` na mesma transação.

Request:

```json
{
  "nome": "Atlética TSI",
  "descricao": "Gestão 2026/2027",
  "inicioGestao": "2026-09-01",
  "fimGestao": "2027-08-31"
}
```

Sucesso `201`:

```json
{
  "organizacao": {
    "id": "3",
    "nome": "Atlética TSI",
    "descricao": "Gestão 2026/2027",
    "inicioGestao": "2026-09-01",
    "fimGestao": "2027-08-31",
    "linkPublico": null,
    "transparenciaAtiva": false
  },
  "vinculoCriador": {
    "id": "15",
    "papel": "TESOUREIRO",
    "dataVinculo": "2026-10-14",
    "ativo": true
  }
}
```

`fimGestao` não pode anteceder `inicioGestao`; os dois podem ser o mesmo dia. Quem já tinha
vínculo ativo em outra organização passa a ter dois e precisa enviar `X-Organization-Id` nas rotas
que dependem do contexto.

Erros:

- `400`: dados inválidos, data inexistente, período invertido ou propriedade não reconhecida;
- `401`: autenticação ausente ou inválida, ou conta inativa.

### `PUT /organizacoes/{id}`

Exige autenticação e papel `TESOUREIRO`. O `{id}` precisa ser a organização do contexto. Altera
parcialmente `nome`, `descricao`, `inicioGestao` e `fimGestao`, com ao menos um deles. Uma data
enviada sozinha é validada contra a que já está gravada.

Request:

```json
{ "nome": "Atlética TSI 2026", "fimGestao": "2027-01-31" }
```

Sucesso `200`: devolve a organização no mesmo formato de `organizacao` acima.

O período não pode deixar de fora nenhum lançamento da organização, estornados inclusive: fora da
gestão um lançamento não poderia mais ser corrigido.

Erros:

- `400`: dados inválidos, corpo vazio, período invertido ou propriedade não reconhecida;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão ou vínculo inativo;
- `404`: organização diferente da do contexto;
- `409`: o novo período deixa lançamentos de fora.

## Transparência pública

### `GET /organizacoes/atual/link-publico`

Exige autenticação e papel `TESOUREIRO`.

Sucesso `200` com o link vigente:

```json
{
  "token": "string",
  "ativo": true
}
```

Quando a organização ainda não tem link gerado, responde `200` com `null`. A ausência de link é um
estado normal da organização, e não um erro.

A consulta não altera o token. Gerar um link novo troca o endereço e derruba o anterior, então a
leitura existe para que a tela mostre o link atual sem precisar substituí-lo.

Erros:

- `401`: token ausente, inválido ou expirado.
- `403`: papel diferente de `TESOUREIRO`.

### `POST /organizacoes/atual/link-publico`

Exige autenticação e papel `TESOUREIRO`. Gera ou regenera token aleatório de pelo menos 32 bytes e
ativa a transparência.

Sucesso `200`:

```json
{ "token": "base64url-imprevisivel", "ativo": true }
```

Erros:

- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão.

### `PATCH /organizacoes/atual/link-publico`

Exige autenticação e papel `TESOUREIRO`.

Request:

```json
{ "ativo": false }
```

Sucesso `200`:

```json
{ "token": "base64url-imprevisivel", "ativo": false }
```

Erros:

- `400`: campo `ativo` inválido;
- `401`: autenticação ausente ou inválida;
- `403`: papel sem permissão;
- `409`: tentativa de ativação ou desativação sem token previamente gerado.

### `GET /publico/{token}`

Pública, sem autenticação. Retorna identificação da organização, saldo atual, totais e extrato
resumido permitido, sem dados pessoais ou identificação do responsável pelos lançamentos.

Query opcional: `mes=YYYY-MM`.

Sucesso `200`:

```json
{
  "organizacao": {
    "nome": "Comissão de Formatura",
    "descricao": "Prestação de contas da turma"
  },
  "saldoAtual": "400.00",
  "periodo": { "mes": "2026-09" },
  "totais": { "entradas": "500.00", "saidas": "200.00" },
  "extrato": [
    {
      "id": "30",
      "data": "2026-09-02",
      "tipo": "SAIDA",
      "valor": "50.00",
      "descricao": "Compra de material",
      "categoria": { "id": "10", "nome": "Material" }
    }
  ]
}
```

Erros:

- `400`: período ou filtros inválidos;
- `404`: token inexistente ou transparência desativada.

Compatibilidade atual: responde em `GET /transparency/:publicLink`, usa nomes em inglês e entrega
somente agregados mensais por categoria; o saldo atual e o extrato resumido ainda não fazem parte da
resposta temporária.
