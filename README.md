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
3. Legal pieces glow. Choose one to make the move; when a card has more than one action, choose the action in the move desk.
4. For a 7, assign the seven legal steps one at a time. For a Jack, choose the initiating piece and then its swap.
5. When no card can move—or a 10 forces the turn—choose a card and use **Discard selected card**.

The board marks protected entries with an outer gold ring. Partners sit opposite one another: Poppy and Sunny play against River and Fern.

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
