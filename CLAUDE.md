# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A production-control kanban board ("Quadro de Produção") for Metalrail, a metal-fabrication shop. The UI language is Brazilian Portuguese; keep new user-facing strings in pt-BR.

There is **no build system, no package.json, no tests, and no dependencies to install.** Firebase and the Inter font are loaded from CDNs. The app runs on GitHub Pages at **https://gestao.metalrail.com.br** (see `CNAME`) — ES modules work natively over HTTPS.

⚠️ **There is no deploy step and no staging environment: merging to `main` publishes to production.** Treat every merge as a release.

## File structure

```
index.html          HTML structure only (~110 lines)
style.css           All CSS (~245 lines)
js/
  main.js           Entry point (<script type="module" src="js/main.js">)
  firebase.js       Firebase config, db, auth, docRef()
  utils.js          Time/week helpers + COLS, FLUXO, SETOR_IDS constants
  state.js          Single shared mutable state object
  capacity.js       Capacity math: getCardMin, getCapMin, getUsedMin, saldo*, cap*
  render.js         render(), renderGerarBar(), renderDesempenho(), setupDrop/CardDrop,
                    sortCards, reorderInColumn, atualizarBotoesNav, printBoard
  sync.js           saveWeek(), syncToNext(), syncFromPrev(), loadWeek(),
                    gerarProximaSemana(), setSyncStatus(), initSync()
  card.js           Modal + delCard, editCard, saveCard, setUrgente, openModal, closeModal
  auth.js           doLogin, doVisitor, doLogout, onAuthStateChanged setup
```

## Backend & auth

- **Firestore** is the single source of truth. One document per week in the `semanas` collection, keyed `YYYY-Www` (e.g. `2026-W22`). `docRef(w)` in `firebase.js` builds the reference.
- A week document is `{ cards, caps, nextId, gerada, parentWeek }`. `caps` maps sector id → capacity in minutes; `gerada` (boolean) is the central state flag.
- Live updates use `onSnapshot`; writes use `setDoc` (whole-document overwrite, no merge).
- **Firebase Auth** (email/password). **Authorization lives in `firestore.rules`, not in the client.** The rule lists the five editor emails and requires `email_verified == true`; `auth.js` merely mirrors that second condition (`state.isEditor = !!user.emailVerified`) to decide whether to show the editing UI. The "visitor" button, and any unverified account, gets a read-only view via the `readonly` body class.
- **Never put the editor email list back into client code.** It was there until 2026-08-07 and, because `/js/auth.js` is served publicly, it handed every address — and the company domain — to any visitor. If the UI ever needs to know who is an editor, derive it from something the server controls (a custom claim), not a hard-coded array.

## Shared state

All mutable state lives in the single exported object from `js/state.js`:

```js
state.currentWeek   // String YYYY-Www, current board week
state.weekData      // { cards, caps, nextId, gerada } — current week's Firestore doc
state.isSaving      // re-entrancy guard around saveWeek()
state.dragId / state.dragSourceCol
state.editingId / state.isUrgente
state.desempWeek / state.desempInicializado
state.currentUser / state.isEditor / state.isVisitor
```

Any module that writes `state.foo = x` propagates the change to all other modules that imported the same object reference.

## Dependency injection (render ↔ sync)

`sync.js` calls `render()`, `renderGerarBar()`, `atualizarBotoesNav()` from `render.js`, but `sync.js` cannot import `render.js` directly (would create a cycle). The solution is `initSync()` called once in `main.js`:

```js
// main.js
import { initSync, loadWeek } from './sync.js';
import { render, renderGerarBar, atualizarBotoesNav } from './render.js';
initSync({ render, renderGerarBar, atualizarBotoesNav });
```

**Always call `initSync` before `loadWeek`.**

## Domain model

- A **card** is one OS (ordem de serviço): `{ id, os, cliente, col, min_setor, min_total, horas, dataEntrega, urgente, carriedFrom, ordem }`.
- `min_setor` holds estimated minutes **per sector**; this is the canonical time data. `horas`/`min_total` are derived.
- `col` is which board column the card sits in. Workflow order is `FLUXO` (in `utils.js`): `fila → laser → dobra → solda → acab → terc → insp → exped → conc`. `fila`, `conc`, and `terc` have no capacity tracking (`noCap`).
- Capacity math sums `min_setor[col]` over every card **not in `fila`** — once work leaves the queue it counts against every sector's weekly load.
- Ordering: `sortCards` puts cards with a manual `ordem` field first, then by `dataEntrega`. Drag-and-drop within a column rewrites `ordem`; dragging across columns clears it.

## The week-propagation model (most bug-prone area)

A week is either an **espelho** (mirror, `gerada: false`) or **independente** (`gerada: true`).

- `syncFromPrev(week)` — runs on every navigation/load; pulls from parent week. For a mirror it rebuilds cards as a **faithful reflection of the parent**: every non-concluded OS appears in the **same `col` it has in the parent** (the mirror does NOT keep its own card moves — parent column changes always propagate). Cards added directly to the mirror (no `carriedFrom` from the parent) are preserved. Mirror `caps` stay independent (not copied from the parent) until the week is generated. For an independent week it only *adds* newly-pending OS and *removes* OS completed in the parent.
- `syncToNext()` — pushes pending cards forward, but **only if the next week already exists and has `parentWeek` pointing at the current week.** Must never create a new week.
- `loadWeek`'s `onSnapshot` callback must **not** call `syncToNext()` unconditionally — doing so while *viewing* a mirror week causes an infinite loop that wipes cards. The guarded check (`nextSnap.data().parentWeek === week`) is what prevents it.
- `gerarProximaSemana()` snapshots the next week into an independent copy and immediately creates the week after it as a new mirror.

## window.* functions

All functions referenced by `onclick`/`oninput`/`onchange` in HTML must be on `window`. Each module assigns its own:

| Module | window.* functions |
|---|---|
| `utils.js` | `fmtTime`, `fmtCap` |
| `render.js` | `printBoard` |
| `sync.js` | `gerarProximaSemana` |
| `card.js` | `delCard`, `editCard`, `setUrgente`, `openModal`, `closeModal`, `saveCard` |
| `auth.js` | `doLogin`, `doReset`, `doVisitor`, `doLogout` |
| `main.js` | `setCap`, `changeWeek`, `switchTab`, `changeDesempWeek`, `searchOS` |

## Conventions

- All persistence goes through `saveWeek()` in `sync.js`. Never call `setDoc` on the current week directly.
- `isSaving` is a re-entrancy guard; respect it when adding new write paths.
- `render.js` imports `saveWeek` from `sync.js` directly (no cycle — `sync.js` does not import `render.js`).
- `setCap` is defined in `main.js` (not `capacity.js`) because it needs both `saveWeek` and `render`.

## Versionamento

- Git repo: **https://github.com/grupo-m-jf/Metalrail-quadro-producao** (privado, na organização do grupo desde 2026-07-30)
- Branch de trabalho: `main`. Todo trabalho via PR — nunca commitar direto na `main`.
- **PowerShell stdin gotcha:** piping token via `|` em PS 5.1 corrompe bytes. Usar `cmd.exe /c 'echo TOKEN|"...gh.exe" auth login --with-token'`.

## Rollback

Reverter é `git revert` do PR e merge — a `main` é o que está publicado.

⚠️ **O rollback antigo não existe mais.** Até 2026-08-07 este arquivo mandava
trocar uma linha do `index.html` para voltar ao monólito `app.js`. Aquilo tinha
deixado de funcionar sem ninguém notar: o `app.js` guardava o `firebaseConfig` do
projeto **`quadro-producao`**, abandonado na migração de 2026-07-31 — a "volta
segura" ligaria o quadro no banco morto. O arquivo foi apagado (também expunha
quatro e-mails de editor) e continua recuperável pelo histórico do git.
