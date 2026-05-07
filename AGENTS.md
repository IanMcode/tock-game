<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Project: Tock Game

This is a browser-based multiplayer Tock-style board game built with Next.js, TypeScript, and Tailwind.

## Development rules

- Keep game rules separate from React UI.
- Put pure game logic in `src/game/`.
- React components should display state and dispatch actions, not contain rule logic.
- Use TypeScript types strictly.
- Prefer small, testable functions.
- Do not add multiplayer until the local game engine works.
- Do not add authentication, payments, rankings, or public matchmaking yet.
- Keep the first version focused on a 4-player partner game.
- Use original placeholder art/UI. Do not copy Board Game Arena assets.

## First milestone

Build a local-only prototype that can:
- Create a 4-player game.
- Deal cards.
- Track turn order.
- Represent marbles/pieces on a board.
- Allow simple legal moves.
- Render the board and each player's hand.
<!-- END:nextjs-agent-rules -->
