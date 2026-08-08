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

Sem a lista no cliente, **qualquer conta autenticada e verificada vê a interface
de edição**. Hoje existem só as cinco contas e a tela não oferece cadastro, mas a
API de criação de conta pode estar aberta no projeto. Escrever seguiria
bloqueado pelas regras — a pessoa veria botões que falham.

⚠️ **Isto não foi testado criando uma conta**, deliberadamente: testar exposição
escrevendo em produção foi o erro registrado em 2026-07-31 e não se repete aqui.
A verificação é um clique no console: **Authentication → Settings → User actions
→ desmarcar "Enable create (sign-up)"**.

### Limite da mensagem neutra (medido, não suposto)

A frase igual protege **a tela**, não a rede. No teste com `naoexiste@example.com`
o Firebase respondeu **HTTP 400 (`EMAIL_NOT_FOUND`)**, e isso aparece no console
do navegador: quem abrir o DevTools distingue 400 de 200 e descobre quais
endereços têm conta, um a um.

Esse teste prova que a **"Email enumeration protection" está DESLIGADA** neste
projeto. Ligá-la (**Authentication → Settings → User actions**) faz a própria API
responder igual nos dois casos, e só então a promessa da mensagem neutra vale de
ponta a ponta. **É a segunda ação de console que depende do responsável**, e a
mais relevante das duas para o objetivo declarado.

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
