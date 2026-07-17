# Tock Game Roadmap

## Milestone 1: Local game engine

Goal: Build a tested local-only game engine.

The canonical default game rules are defined in [RULES.md](./RULES.md).

Must support:
- 4 players
- 4 pieces per player
- Standard deck
- Shuffle
- Deal cards
- Turn order
- Current player
- Reserve, main-track, and home-lane piece positions
- 72-space board geometry
- Protected entry state
- Starting a piece with A/K
- Moving pieces forward with normal number cards
- Discard pile
- Basic legal move generation and validation

Not included:
- Multiplayer
- Accounts
- Matchmaking
- Chat
- Mobile app packaging
- Rule variants
- Fancy UI

## Milestone 2: Debug UI

Goal: Render the local game state in the browser.

Must support:
- Start new local game
- Show players
- Show current player
- Show each player's pieces
- Show cards
- Click a card
- Click a piece
- Apply a simple move
- Advance turn

## Milestone 3: More complete rules

Goal: Add the annoying Tock-specific rules.

Must support:
- Exact home entry
- Capture/bump logic
- Backward 4
- Jack swap
- Split 7
- No-valid-move discard
- Partner/team rules

## Milestone 4: Private-room multiplayer

Goal: Let four people play together online in a private room.

Must support:
- Create room
- Join room code
- Assign player seats
- Start game
- Server-authoritative moves
- Reconnect after refresh
- Hide opponent hands

## Milestone 5: Polish

Goal: Make it feel nice.

Must support:
- Better board layout
- Card animations
- Move highlighting
- Mobile/tablet layout
- Basic sound effects
- Rule explanations
