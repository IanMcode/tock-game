# Tock

A local four-player partner game of Tock, built with Next.js, TypeScript, and Tailwind CSS.

## Play locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Everything runs in one browser; there are no accounts, rooms, or network services.

## How to use the table

1. At the start of each hand, choose one card from every player's hand for the blind partner exchange.
2. On a turn, choose a card in the current player's hand.
3. Legal pieces glow. Choose one, then choose one of its glowing destinations on the board to complete the move.
4. For a 7, choose any highlighted distance for the selected piece, then assign any remaining steps. For a Jack, choose the initiating piece and then its swap destination.
5. When no card can move—or a 10 forces the turn—choose a card and use **Discard selected card**.

Use **Space numbers** above the board to show or hide each player's 1–18 track labels. The move desk keeps the most recent card visible and records the latest turns in its play log.

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

## Verify

```bash
npm test -- --run
npm run lint
npm run build
```
