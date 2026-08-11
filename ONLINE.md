# Online Play Architecture

This document describes the online foundation currently implemented and the work
remaining before public deployment. The `/online` browser client can create or
join a room, reconnect within the tab, and play through the authoritative API.

## Authority model

The server owns the complete `GameState`. Clients send commands rather than new
state. Every command contains:

- a unique `commandId`, making a retried request idempotent;
- the client's `expectedRevision`, preventing stale updates;
- an `actor` that must match the private token's assigned seat;
- the requested exchange, discard, or legal card move.

The server checks seat ownership, turn ownership, revision, move legality, and the
complete game invariants before publishing the next revision. Clients should treat
a `REVISION_CONFLICT` response as a request to fetch the latest room view and
rebuild their selection from that state.

Random decisions use a PRNG state stored inside the game. This makes every later
deck shuffle reproducible from a saved snapshot and command history. Snapshots
carry a schema version and are fully validated when loaded.

## Hidden information

The server never sends a raw `GameState` to clients. A player view contains:

- that player's full hand;
- other players' hand counts;
- public pieces, turn, dealer, phase, and discard pile;
- draw-pile count without its card order;
- exchange completion flags without selected card indexes.

A spectator view contains no private hand. Player tokens are credentials and must
never be included in logs, URLs, public room state, or another player's response.
Player-chosen display names are public room metadata, limited to 24 characters,
and retained with the room across reconnects.
Played and discarded cards are public room history, including the owner and
number of every piece eliminated by a move. Client views never include the
private hand index used to submit a command.
Each client replays unseen public move events before adopting the latest board
snapshot, so opponents and reconnecting viewers see the same movement sequence.
The rendered board rotates per viewer so their own seat is always at the bottom,
while labels, pieces, and the shared most-recent-card display stay upright.

## Guest room API

All responses use `Cache-Control: no-store`. Player endpoints authenticate with
`Authorization: Bearer <playerToken>`.

### Create a room

`POST /api/rooms`

Returns the room view plus the P1 seat and its reconnect token. The room begins in
`waiting` status. The optional JSON body selects the rules and dealer:

```json
{
  "playerCount": 3,
  "teams": false,
  "dealer": "random"
}
```

`dealer` may be `random` or an active player ID. Teams are accepted only for a
four-player room.

### Join a room

`POST /api/rooms/{roomId}/join`

Assigns the next open seat and returns its reconnect token. The room becomes
`active` when all seats selected by the host are occupied.

### Read or reconnect

`GET /api/rooms/{roomId}`

With a valid Bearer token, returns that player's private view. Without a token,
returns a spectator-safe view.

### Submit a command

`POST /api/rooms/{roomId}/commands`

Example body:

```json
{
  "commandId": "a-client-generated-uuid",
  "expectedRevision": 7,
  "command": {
    "type": "select-exchange-card",
    "actor": "P1",
    "cardIndex": 2
  }
}
```

The API also accepts `play-card` with a legal move object and `discard-card` with
a card index or `null` when the forced player has no card.

## Storage and real-time delivery

When `DATABASE_URL` is present, production rooms use `NeonRoomStore`. The store
creates its table and expiry index idempotently on first use, keeps room snapshots
as validated versioned JSON, and uses an atomic storage version for joins and game
commands. This prevents two server instances from both accepting a write based on
the same room state. Player reconnect tokens are SHA-256 hashed before storage.

Rooms expire seven days after their last successful join or game command. Reads do
not extend that lifetime. Local development and automated tests fall back to
`InMemoryRoomStore` when `DATABASE_URL` is absent.

The current client polls `GET /api/rooms/{roomId}` and refreshes after a rejected
stale command. Server-Sent Events or WebSockets can later replace polling as a
notification layer. Notifications should only tell clients that a newer revision
exists; authoritative state still comes from the same privacy-safe room view.

## Production checklist

Before broad public use:

1. Add token rotation and explicit leave/reclaim behavior.
2. Rate-limit room creation, joins, reads, and invalid commands.
3. Enforce allowed origins and HTTPS; never place player tokens in query strings.
4. Add structured logs that exclude hands, draw piles, and player tokens.
5. Add a cross-device reconnect/reclaim flow; tab-scoped reconnect is implemented.
6. Replace polling with an SSE/WebSocket notification adapter if needed.
7. Add browser-level tests with isolated clients for every supported room size.

Authentication, rankings, payments, public matchmaking, and chat remain outside the
current milestone.

## Two-to-four-player boards

Board topology is now data-driven for two, three, and four seats:

| Players | Track | Home lanes | Pieces per player |
| --- | ---: | ---: | ---: |
| 2 | 36 spaces | 2 × 4 | 4 |
| 3 | 54 spaces | 3 × 4 | 4 |
| 4 | 72 spaces | 4 × 4 | 4 |

All three free-for-all player counts and `classic-partners-4` are enabled and
covered by complete-game simulations. The local setup, room capacity, deal
schedule, movement geometry, and board renderer consume the selected ruleset.
Four-player teams always sit opposite; exchange and teammate-piece control exist
only in that ruleset.
