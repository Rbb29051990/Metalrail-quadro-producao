# "Esqueci minha senha" na tela de login — desenho

**Data:** 2026-08-07 · **Estado:** aprovado pelo responsável, pronto para implementar

## Problema

Quem perde a senha depende hoje de alguém disparar o link de redefinição por fora
do app — foi o que aconteceu em 2026-07-31 (criação das contas) e de novo em
2026-08-07 (reenvio a pedido). O quadro tem cinco editores e nenhum caminho de
autoatendimento; cada esquecimento vira uma tarefa manual de outra pessoa.

Junto disso, o responsável pediu que a dica do campo de e-mail deixasse de ser
`seu@metalrail.com.br`, para não entregar o domínio da empresa a quem abre a
página.

## O que a exploração mostrou, e que mudou o desenho

1. **O site é GitHub Pages** (`CNAME` → `gestao.metalrail.com.br`). Não há build
   nem etapa de deploy: **mergear na `main` publica em produção**. O
   `firebase.json` cuida apenas das regras do Firestore.
2. **A autorização real vive no `firestore.rules`**, no servidor, com os cinco
   e-mails e a exigência `email_verified == true`. O array `EDITORS` do
   `js/auth.js` é só um porteiro de interface.
3. 🚨 **O `js/auth.js` é público e lista os cinco e-mails inteiros.** Trocar só o
   placeholder seria cosmético: o domínio continuaria a um clique de distância,
   em `gestao.metalrail.com.br/js/auth.js`.
4. 🚨 **O `app.js` legado também está no ar** (48 KB, `HTTP 200`), tem quatro dos
   cinco e-mails **e aponta para o projeto Firebase morto** `quadro-producao`. O
   "rollback" descrito no `CLAUDE.md` — trocar uma linha do `index.html` para
   voltar ao `app.js` — hoje não é rollback: ligaria o quadro no banco abandonado.

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| D1 | Placeholder vira `seu@email.com.br` | Não entregar o domínio na tela |
| D2 | O domínio sai também do código público (`EDITORS` deletado, `app.js` apagado) | Sem isso, D1 é maquiagem |
| D3 | Resposta **neutra sempre**, com "(pasta de SPAM)" explícito | Mensagem que distingue conta existente de inexistente transforma a tela num testador de e-mails |
| D4 | Link discreto abaixo do campo SENHA, reaproveitando o e-mail já digitado | Cabe na caixa de 340 px, funciona igual no celular, não cria estado de tela novo |
| D5 | O `firestore.rules` **não muda** | É o portão real, roda no servidor e não é legível pelo visitante |

## Desenho

### Interface (`index.html`, `style.css`)

- `index.html:20` — placeholder `seu@metalrail.com.br` → `seu@email.com.br`.
- Abaixo do campo SENHA, um `<button type="button" class="login-link">Esqueci
  minha senha</button>`. **Botão, não `<a href="#">`**: é uma ação, não um
  destino — e assim teclado e leitor de tela funcionam sem gambiarra.
- Um `<div class="login-info" id="login-info">` para a confirmação, **separado**
  da `.login-err` vermelha: recado bom não deve parecer erro.

### Fluxo (`js/auth.js`, `js/firebase.js`)

`js/firebase.js` passa a importar e reexportar `sendPasswordResetEmail`.

`window.doReset()`:

1. Lê o campo de e-mail (`trim().toLowerCase()`).
2. Vazio → `.login-err`: *"Digite seu e-mail acima para receber o link."*
3. Chama `sendPasswordResetEmail(auth, email)`.
4. `auth/invalid-email` → `.login-err`: *"E-mail inválido."* — é erro de
   digitação, não vazamento: o endereço nem tem forma de e-mail.
5. **Qualquer outro desfecho, inclusive `auth/user-not-found` (engolido de
   propósito) e sucesso** → `.login-info`, sempre a mesma frase: *"Se este e-mail
   estiver cadastrado, o link chega em instantes. Confira o lixo eletrônico
   (pasta de SPAM)."*
6. Após o clique, o botão fica **desabilitado por 30 s**, exibindo *"Aguarde
   30 s…"* em contagem regressiva. Impede que a tela vire uma metralhadora de
   e-mails contra um endereço alheio.

### Autorização no cliente

`EDITORS` é deletado. `state.isEditor = !!user.emailVerified`, que **espelha
exatamente** a condição da regra do Firestore em vez de duplicar uma lista que
envelhece sozinha. `doLogin` perde o pré-filtro por e-mail e passa a confiar na
resposta do Firebase (`auth/invalid-credential` → *"E-mail ou senha
incorretos."*).

**Nenhuma permissão é afrouxada:** quem decide se a escrita passa é o
`firestore.rules`, que segue com os cinco endereços. A interface apenas deixa de
repetir mal o que a regra já faz bem.

### Risco residual (ação do responsável)

Sem a lista no cliente, **qualquer conta autenticada e verificada veria a
interface de edição**. Escrever seguiria bloqueado pelas regras — a pessoa veria
botões que falham.

✅ **RESOLVIDO em 2026-08-07:** a criação de conta foi **desativada** no console
(*Authentication → Configurações → Ações do usuário → "Ativar criação
(inscrição)" desmarcado*). Contas passam a nascer só pelo console.

⚠️ **Isto nunca foi testado criando uma conta**, deliberadamente: testar exposição
escrevendo em produção foi o erro registrado em 2026-07-31 e não se repete aqui.

### A mensagem neutra vale de ponta a ponta — e a primeira medição estava errada

A **"Proteção contra enumeração de e-mails" está LIGADA** neste projeto, e
verificada pela API:

| Entrada | Resposta |
|---|---|
| `naoexiste-teste-2@example.com` (não existe) | **HTTP 200**, corpo com o e-mail ecoado |
| `nao-e-email` (mal formado) | HTTP 400 `INVALID_EMAIL` |

Ou seja, a API **não distingue** conta existente de inexistente: só recusa o que
nem tem forma de e-mail. A frase neutra da tela é honesta na rede também.

📌 **Correção de um erro meu, registrada porque quase virou recomendação errada.**
A primeira versão deste documento afirmava que a proteção estava **desligada**,
"medido, não suposto", a partir de um `HTTP 400` visto no console do navegador. O
400 existia mesmo — mas era do teste **seguinte**, com o e-mail mal formado.
**Atribuí o erro à requisição errada e transformei uma coincidência de ordem numa
conclusão.** A lição: quando a evidência é um erro solto no console, **confirmar
qual requisição o produziu** antes de concluir qualquer coisa — um `curl` direto
ao endpoint teria desfeito a dúvida em dez segundos, e foi ele que a desfez.

## Verificação

O repositório não tem testes nem build. O roteiro foi executado em servidor local
(`python -m http.server`) contra o Firebase real, com o resultado lido do DOM:

| # | Caso | Resultado |
|---|---|---|
| 1 | Campo vazio | ✅ *"Digite seu e-mail acima para receber o link."*, sem travar o botão |
| 2 | `nao-e-email` | ✅ *"E-mail inválido."* |
| 3 | `naoexiste@example.com` | ✅ frase neutra + botão em *"Aguarde 23s…"*, desabilitado |
| 4 | Visitante | ✅ `readonly`, "Sincronizado", 62 cards lidos do Firestore |
| 5 | Sintaxe dos 11 módulos | ✅ `node --check` limpo em todos |
| 6 | E-mails nos arquivos servidos | ✅ nenhum — só o placeholder `seu@email.com.br` |

**O caso "e-mail real de editor" não foi executado**, de propósito: dispararia
mais um e-mail para terceiros sem que ninguém tivesse pedido. A propriedade que
ele verificaria — mensagem idêntica para conta existente e inexistente — está
garantida **por construção**, não por observação: o sucesso e o
`auth/user-not-found` caem nas mesmas duas linhas finais da função, sem desvio
entre eles.

## Fora de escopo

Recuperação por SMS/2FA, autocadastro, tela de perfil, troca de senha com o
usuário logado. Nada disso foi pedido e cada um traria estado novo.

## Publicação

GitHub Pages: **o merge na `main` publica direto em produção**, sem ambiente
intermediário. O merge é o portão do responsável.
