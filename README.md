# Tock

A two-to-four-player game of Tock, built with Next.js and TypeScript. It includes
both a local test table and private-code guest rooms backed by an authoritative
server game session.

## Play locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the local test table, or
[http://localhost:3000/online](http://localhost:3000/online) to create or join a
private room in separate browser tabs or devices connected to the same server.

## How to use the table

1. At the start of each hand, choose one card from every player's hand for the blind partner exchange.
2. On a turn, choose a card in the current player's hand.
3. Legal pieces glow. Choose one, then choose one of its glowing destinations on the board to complete the move.
4. For a 7, choose any highlighted distance for the selected piece, then assign any remaining steps. For a Jack, choose the initiating piece and then its swap destination.
5. When no card can move—or a 10 forces the turn—choose a card and use **Discard selected card**.

Use **Space numbers** above the board to show or hide each player's 1–18 track labels. The center of the board shows the most recently played card, and the play log records recent turns and any pieces eliminated by those moves.

After a destination is confirmed, the marble hops through every crossed space before the move is committed. Controls remain locked until the animation finishes.

Reserve and eliminated pieces remain visible in the four colored trays around the board. Each tray also shows one face-down card for every card remaining in that player's hand. By default, every player begins with piece one protected on their entry space; the remaining pieces begin in reserve. A protected piece carries a gold inner ring and a gold ✦ badge until it moves. Partners sit opposite one another: Poppy and Sunny play against River and Fern.

## Included rules

- Two-, three-, or four-player free-for-all, plus opposite-seat teams for four players
- 36-, 54-, or 72-space shared track, reserve, protected entry, and four-space home lanes
- Deck-maximizing 5/4 deal schedules, dealer rotation, and team-only partner exchange
- Entry, forward and backward movement, exact home entry, captures, and blockades
- Ace and King entry, backward 4, universal 5, split 7, forced-discard 10, Jack swap, and face-card movement
- Partner piece control after a player gets all four pieces home in team games
- Individual or team win detection and automatic progression between hands and decks

The canonical rules are documented in [RULES.md](./RULES.md). Pure game logic lives in `src/game/`; the React interface only presents state and dispatches legal actions.

## Online play

The online lobby and remote table use a tested guest-room API:

- deterministic shuffling and versioned game snapshots;
- revisioned, idempotent commands validated by an authoritative game session;
- private player views that expose only the viewer's hand;
- room codes, two-to-four guest seats, tab-scoped reconnect tokens, and spectator-safe views;
- a player-relative board that aligns each viewer's seat, entry, and home lane along the bottom;
- a responsive game surface that keeps the largest practical board and the viewer's hand visible together;
- corner-anchored tracks with each player's space 12 marking a change of direction;
- create, join, read, and command Route Handlers under `/api/rooms`;
- private hands, partner exchange, legal destination selection, split-seven moves,
  discards, player-chosen names, synchronized movement and dealing animations, shared play
  history, Ably realtime updates, and revision-conflict recovery in the remote table;
- durable Upstash Redis rooms with atomic updates, hashed player tokens, and
  seven-day expiry when the Upstash REST variables are configured;
- a 30-second HTTP safety refresh only while realtime is disconnected, with all
  network activity stopped for hidden tabs and completed games;
- an existing Neon PostgreSQL adapter retained as a temporary fallback;
- an in-memory fallback for local development and automated tests.

See [ONLINE.md](./ONLINE.md) for service setup, the API and security model, and
remaining public-launch hardening work.

## Verify

```bash
npm test
npm run lint
npm run build
```
