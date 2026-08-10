# Tock

A four-player partner game of Tock, built with Next.js and TypeScript. The current
table runs locally, and the engine now includes the authoritative room foundations
needed for guest online play.

## Play locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The visible table remains the
local test client; it does not yet connect to an online room.

## How to use the table

1. At the start of each hand, choose one card from every player's hand for the blind partner exchange.
2. On a turn, choose a card in the current player's hand.
3. Legal pieces glow. Choose one, then choose one of its glowing destinations on the board to complete the move.
4. For a 7, choose any highlighted distance for the selected piece, then assign any remaining steps. For a Jack, choose the initiating piece and then its swap destination.
5. When no card can move—or a 10 forces the turn—choose a card and use **Discard selected card**.

Use **Space numbers** above the board to show or hide each player's 1–18 track labels. The move desk keeps the most recent card visible and records the latest turns in its play log.

After a destination is confirmed, the marble hops through every crossed space before the move is committed. Controls remain locked until the animation finishes.

Reserve and eliminated pieces remain visible in the four colored trays around the board. Each tray also shows one face-down card for every card remaining in that player's hand. By default, every player begins with piece one protected on their entry space; the remaining pieces begin in reserve. A protected piece carries a gold inner ring and a gold ✦ badge until it moves. Partners sit opposite one another: Poppy and Sunny play against River and Fern.

## Included rules

- Four players, four pieces each, and opposite-seat partners
- 72-space shared track, reserve, protected entry, and four-space home lanes
- Three-hand 5/4/4 deal schedule, dealer rotation, and simultaneous partner exchange
- Entry, forward and backward movement, exact home entry, captures, and blockades
- Ace and King entry, backward 4, universal 5, split 7, forced-discard 10, Jack swap, and face-card movement
- Partner piece control after a player gets all four pieces home
- Team win detection and automatic progression between hands and decks

The canonical rules are documented in [RULES.md](./RULES.md). Pure game logic lives in `src/game/`; the React interface only presents state and dispatches legal actions.

## Online foundation

The project now has a tested guest-room API beneath the local table:

- deterministic shuffling and versioned game snapshots;
- revisioned, idempotent commands validated by an authoritative game session;
- private player views that expose only the viewer's hand;
- room codes, four guest seats, reconnect tokens, and spectator-safe views;
- create, join, read, and command Route Handlers under `/api/rooms`;
- a replaceable `RoomStore` boundary for future durable storage.

The bundled store is intentionally in-memory and suitable only for development or
a single long-running Node process. See [ONLINE.md](./ONLINE.md) for the API,
security model, production requirements, and 2–4-player roadmap.

## Verify

```bash
npm test
npm run lint
npm run build
```
