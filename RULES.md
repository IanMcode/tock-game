# Tock Game Rules

This document defines the enabled two-to-four-player rulesets. Four-player
opposite-seat teams remain the default; two- and three-player games are always
free-for-all, and four players may also choose free-for-all.

## Players and teams

- Players sit in board order using the first two, three, or four seats.
- Two- and three-player games are free-for-all. Four-player games may be
  free-for-all or use fixed opposite-seat teams: P1 with P3, and P2 with P4.
- Play proceeds clockwise, to the player on the current player's left.
- Each player has four pieces.
- In free-for-all, the first player with all four pieces home wins immediately.
- In team play, a team wins when all eight pieces belonging to its two players
  are in their respective home lanes.

In team play, when all four of a player's pieces are home, that player uses
their cards to play their partner's pieces. Free-for-all players never assume
control of another player's pieces.

## Board

- The shared main track has one 18-space section per player: 36 spaces for two
  players, 54 for three, and 72 for four.
- Movement on the main track is clockwise.
- Each player's entry is space 18 of their section.
- Each player's home entrance branches from the main track after space 16 of
  their section.
- Each player has a protected home lane containing four spaces.
- Two pieces may never occupy the same space after a move is resolved.
- Pieces may circle the main track more than once.

A piece approaching its own home entrance in the forward direction may enter
its home lane regardless of how far it has previously travelled. This means a
backward 4 or a Jack swap can position a piece to enter home without completing
a full circuit.

## Deck, deals, and dealer

- The game uses one standard 52-card deck without jokers.
- Every hand contains at least four cards per player. The first hand increases
  to five when doing so deals more of the 52-card deck:
  - two players: 5/4/4/4/4/4;
  - three players: 5/4/4/4;
  - four players: 5/4/4.
- The first dealer is selected randomly by default, or may be chosen in setup.
- The player to the dealer's left leads every hand dealt from that deck.
- The dealer remains the same until the deck has been exhausted.
- After the final hand, all discarded cards are shuffled to form the new deck.
  The player to the old dealer's left becomes the new dealer and the player to
  the new dealer's left leads.

### Blind partner exchange

At the beginning of every team deal, each player chooses one card to give their
partner. All four cards are exchanged simultaneously before play begins. There
is no card exchange in free-for-all games.

### Engine invariants

The rules engine exposes a complete-state validator for simulations and future
network boundaries. It verifies the four-player roster, piece ownership,
single occupancy, entry protection, exchange indexes, forced-turn ownership,
and conservation of the 52-card deck. Online commands should be validated on
the authoritative host before their resulting state is accepted.

## Turn structure

On a normal turn, a player must play a card if that card has at least one legal
move. The player chooses among all legal cards and moves. A legal move may be
required even when it eliminates one of the player's or team's own pieces.

If no card has a legal move, the player chooses one card to discard. Playing or
discarding a card ends the turn.

### The delayed 5 exception

If moving a 5 is the player's only legal play, the player may instead discard
another card and retain the 5. The player must eventually play the 5 when it is
their final card and it still has a legal move.

### Forced discard from a 10

When a player is affected by a 10, their next turn consists solely of
discarding one card of their choice. They do not move a piece, and the forced
discard ends their turn.

- A 10 causes this effect whether it was played for movement or discarded for
  any reason.
- A 10 discarded during a forced-discard turn applies the same effect to the
  next player, allowing the effect to chain.
- Repeated 10s can cause the same player to lose repeated turns when the player
  on their right triggers the effect repeatedly.
- If the affected player has no cards, the penalty has no effect and does not
  carry into a later deal.

## Entry, protection, and blockades

An Ace or King may use its entire action to introduce one reserve piece onto
its owner's entry space.

- Introducing a piece eliminates any piece already occupying that entry,
  regardless of its owner.
- A newly introduced piece is protected while it remains on that entry space.
- A protected entry piece cannot be passed, landed on, captured, or selected
  as another player's Jack target.
- A protected entry piece therefore blocks movement in both directions.
- A 5 may move a protected piece off its entry.
- The owner may use their protected piece as the initiating piece in a Jack
  swap.

Protection belongs to the newly introduced piece, not to the space. As soon as
that piece moves by any method, its protection is permanently removed. It does
not regain protection by returning to the entry space. A piece gains entry
protection again only after it has been eliminated and subsequently
reintroduced with another Ace or King.

If a Jack moves a protected piece away from its entry, that piece loses its
protection and the piece swapped onto the entry does not gain protection.

## Movement, passing, and elimination

- Except in home lanes and at protected entry blockades, pieces may pass other
  pieces.
- A move that lands on any unprotected piece eliminates the occupying piece,
  including an opponent's, a partner's, or the moving player's own piece.
- An eliminated piece returns to its reserve and requires an Ace or King to
  re-enter play.
- A move cannot finish on an occupied protected entry or home space.
- Unless a card explicitly says otherwise, passing a piece does not eliminate
  it.
- Every card's complete movement must be legal. Partial movement is not
  allowed.

## Home lanes

- A piece may enter only its own home lane and only while moving forward.
- Exact movement is required: a move cannot exceed the available home spaces.
- Pieces in a home lane are protected from all opponent actions and cannot be
  captured, swapped, or otherwise targeted.
- Pieces cannot pass or jump over another piece in a home lane.
- Consequently, an occupied home space blocks access to every deeper space
  until the blocking piece moves farther into the lane.
- Pieces cannot move backward into a home lane or backward out of one.
- A backward move cannot be used by a piece already in home.

## Card actions

### Ace

Choose one action:

- introduce a reserve piece onto its entry;
- move one piece forward 1 space; or
- move one piece forward 11 spaces.

The Ace is playable when any one of these actions is legal.

### 2, 3, 6, 8, and 9

Move one piece forward the card's face value.

### 4

Move one piece backward exactly 4 spaces. It cannot pass a protected entry
blockade, enter home backward, or move a piece backward out of home.

### 5

Move any piece on the main track forward exactly 5 spaces. The selected piece
may belong to the player, their partner, or an opponent. A protected entry
piece is a valid target and loses its protection as soon as it moves. The move
must otherwise be legal.

### 7

Distribute exactly 7 forward steps among any number of the player's eligible
pieces. Once the player is controlling their partner's pieces, those pieces
are eligible instead.

- A piece may receive more than one portion of the movement.
- Portions are resolved sequentially, updating positions and eliminations
  after each portion.
- Every unprotected main-track piece passed or landed on during any portion is
  eliminated, including the player's or partner's pieces.
- A protected entry piece cannot be passed or landed on and blocks that
  portion of the move.
- Home pieces remain protected and cannot be passed or landed on.
- All 7 steps must be assigned and legally completed. If this is impossible,
  the proposed move is invalid.

### 10

Move one piece forward exactly 10 spaces. Whether moved or discarded, the 10
also forces the player on the current player's left to discard on their next
turn as described under **Forced discard from a 10**.

### Jack

Swap the positions of two pieces without eliminating either piece.

- The initiating piece must be one the player is currently entitled to play.
- The other piece may belong to any player, including the same player.
- A player may initiate a swap using their own protected entry piece.
- Another player's protected entry piece cannot be selected as the other
  piece.
- Reserve pieces and pieces in home lanes cannot be swapped.
- The default Jack has no ordinary forward-movement action.

### Queen

Move one piece forward exactly 12 spaces.

### King

Choose one action:

- introduce a reserve piece onto its entry; or
- move one piece forward exactly 13 spaces.

## End of game

The game ends immediately when the first free-for-all player has all four
pieces home, or when both players on one team have all eight team pieces home.
There is no tie or stalemate rule in the default game.

## Deferred rules and variants

These are planned capabilities, not part of the current rules:

- A Jack variant that permits ordinary forward movement, with its exact value
  to be chosen when variant rules are designed.
