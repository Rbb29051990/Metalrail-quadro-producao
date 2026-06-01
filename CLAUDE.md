# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file production-control kanban board ("Quadro de Produção") for Metalrail, a
metal-fabrication shop. The entire app — HTML, CSS, and JS — lives in one file:
`index.html` (~1465 lines). The UI language is Brazilian Portuguese; keep new
user-facing strings in pt-BR.

There is **no build system, no package.json, no tests, and no dependencies to install.**
Firebase and the Inter font are loaded from CDNs via ESM `import` inside a
`<script type="module">`. To run it, open `index.html` in a browser (or serve the
directory over HTTP, e.g. `python -m http.server`, so the module imports resolve).
Edit the file directly — there is no transpile step.

## Backend & auth

- **Firestore** is the single source of truth. One document per week in the `semanas`
  collection, keyed `YYYY-Www` (e.g. `2026-W22`). `docRef(w)` builds the reference.
- A week document is `{ cards, caps, nextId, gerada, parentWeek }`. `caps` maps a
  sector id → capacity in minutes; `gerada` (boolean) is the central state flag (see below).
- Live updates use `onSnapshot`; writes use `setDoc` (whole-document overwrite, no merge).
- **Firebase Auth** (email/password). Editors are hard-coded in the `EDITORS` array;
  any other authenticated email, or the "visitor" button, gets a read-only view applied
  via the `readonly` body class (CSS in the `/* MODO LEITURA */` block hides edit controls).

## Domain model

- A **card** is one OS (ordem de serviço / work order): `{ id, os, cliente, col,
  min_setor, min_total, horas, dataEntrega, urgente, carriedFrom, ordem }`.
- `min_setor` holds estimated minutes **per sector**; this is the canonical time data.
  `horas`/`min_total` are derived. Time is stored as minutes; `timeToMin`/`minToTime`
  convert to/from the `HH:MM` strings shown in inputs (`fmtTime`/`fmtCap` mask typing).
- `col` is which board column the card sits in. The workflow order is `FLUXO`:
  `fila → laser → dobra → solda → acab → terc → insp → exped → conc`. `fila` (queue)
  and `conc` (done) plus `terc` (third-party) have no capacity tracking (`noCap`).
- Capacity math (`getUsedMin`, `getSaldoMin`, `capPct`, etc.) sums `min_setor[col]` over
  every card **not in `fila`** — i.e. once work leaves the queue it counts against every
  sector's weekly load, regardless of the card's current column.
- Ordering: `sortCards` puts cards with a manual `ordem` field first (ascending), then
  the rest by `dataEntrega`. Drag-and-drop within a column rewrites `ordem`
  (`reorderInColumn`); dragging across columns clears `ordem` and appends.

## The week-propagation model (the part that bites)

This is the most subtle and bug-prone area — read carefully before touching
`syncFromPrev`, `syncToNext`, `gerarProximaSemana`, or `loadWeek`.

- A week is either an **espelho** (mirror, `gerada: false`) or **independente**
  (`gerada: true`). A mirror week automatically reflects the non-`conc` cards of its
  parent week (`parentWeek`); generating a week (`gerarProximaSemana`) snapshots it into
  an independent copy that no longer auto-syncs existing cards.
- `syncFromPrev(week)` runs on navigation/load and pulls from the parent. For a mirror it
  rebuilds the card list while **preserving** cards added directly to the child and the
  `col` of cards already moved within the child. For an independent week it only *adds*
  newly-pending parent OS and *removes* OS that were completed in the parent.
- `syncToNext()` pushes the current week's pending cards forward, but **only if the next
  week already exists and has `parentWeek` pointing at the current week.** It must never
  create a new week (that is `syncFromPrev`'s job on navigation) — doing so causes a
  cascade (22→23→24…).
- Known footgun, already fixed and easy to reintroduce: `loadWeek`'s `onSnapshot`
  callback must **not** unconditionally call `syncToNext()`. Calling it while *viewing* a
  mirror week overwrites that week from its parent, which retriggers the snapshot → infinite
  loop that wipes the cards. The guarded check (next-week exists AND its `parentWeek ===
  this week`) is what prevents it.
- Navigation forward is gated by `atualizarBotoesNav` / the guards in `changeWeek` /
  `changeDesempWeek`: past weeks are free; you can always peek one week past "today"; you
  can only go beyond a future mirror week once it has been generated (`gerada: true`).

## UI structure

- Two tabs (`switchTab`): **Quadro** (the board, `render()`) and **Desempenho**
  (per-sector occupancy dashboard, `renderDesempenho()`). The Desempenho tab tracks its
  own `desempWeek` independent of the board's `currentWeek`.
- The board, cards, modal, and print view are all built by string-templating `innerHTML`;
  there is no framework. Event handlers are attached imperatively or exposed as
  `window.fnName` so inline `onclick=` attributes can reach them — any handler referenced
  from HTML must be assigned to `window`.
- `printBoard()` opens a new window with a print-optimized one-page-per-sector layout.
- `searchOS` queries the last 12 weeks up to `currentWeek` only (never future weeks, to
  avoid showing mirrored duplicates).

## Conventions

- Pure vanilla JS, no framework; match the existing terse, comment-in-pt-BR style.
- All persistence goes through `saveWeek()` (sets `sync-status`, optionally propagates via
  `syncToNext`). Don't call `setDoc` on the current week directly — let `saveWeek` own it.
- `isSaving` is a re-entrancy guard around saves; respect it when adding new write paths.

## Security note

`index.html` embeds the public Firebase web config (expected for client apps — security
must be enforced by Firestore rules, not by hiding these keys). Separately, the repo's
sibling `../Secrets/secrets.md.txt` contains a real GitHub personal-access token in
plaintext — treat it as compromised; it should be revoked and never committed.
