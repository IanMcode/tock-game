"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  createOnlineRoom,
  joinOnlineRoom,
  readOnlineRoom,
} from "../../src/online/client";
import type { BoardPlayerCount } from "../../src/game/definition";
import type { PlayerId } from "../../src/game/types";
import type { RoomAccess, RoomView } from "../../src/online/roomService";

const ACCESS_KEY = "tock-online-room-access";
const PLAYER_NAMES: Record<PlayerId, string> = {
  P1: "Poppy",
  P2: "River",
  P3: "Sunny",
  P4: "Fern",
};

export default function OnlineLobby() {
  const [playerCount, setPlayerCount] = useState<BoardPlayerCount>(4);
  const [teams, setTeams] = useState(true);
  const [dealer, setDealer] = useState<PlayerId | "random">("random");
  const [joinCode, setJoinCode] = useState("");
  const [access, setAccess] = useState<RoomAccess | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = sessionStorage.getItem(ACCESS_KEY);
      if (!saved) return;
      try {
        setAccess(JSON.parse(saved) as RoomAccess);
      } catch {
        sessionStorage.removeItem(ACCESS_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await readOnlineRoom(access.roomId, access.playerToken);
        if (!cancelled) {
          setRoom(next);
          setError(null);
        }
      } catch (refreshError) {
        if (!cancelled) setError(messageFrom(refreshError));
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [access]);

  async function createRoom() {
    setBusy(true);
    setError(null);
    try {
      remember((await createOnlineRoom({ playerCount, teams, dealer })).access);
    } catch (createError) {
      setError(messageFrom(createError));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!joinCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      remember((await joinOnlineRoom(joinCode.trim().toUpperCase())).access);
    } catch (joinError) {
      setError(messageFrom(joinError));
    } finally {
      setBusy(false);
    }
  }

  function remember(nextAccess: RoomAccess) {
    sessionStorage.setItem(ACCESS_KEY, JSON.stringify(nextAccess));
    setAccess(nextAccess);
  }

  function leaveRoom() {
    sessionStorage.removeItem(ACCESS_KEY);
    setAccess(null);
    setRoom(null);
    setError(null);
  }

  if (access) {
    return (
      <main className="online-shell">
        <header className="online-header">
          <div>
            <p className="eyebrow">Online room</p>
            <h1>{access.roomId}</h1>
          </div>
          <Link className="quiet-button" href="/">Local table</Link>
        </header>

        <section className="room-card">
          <div className="room-code-block">
            <span>Room code</span>
            <strong>{access.roomId}</strong>
            <button type="button" onClick={() => void navigator.clipboard.writeText(access.roomId)}>Copy code</button>
          </div>
          <div className="room-status-copy">
            <p className="eyebrow">Your seat</p>
            <h2>{PLAYER_NAMES[access.playerId]} · {access.playerId}</h2>
            <p>{room?.status === "active" ? "The table is ready." : `Waiting for ${Math.max(0, (room?.requiredPlayers ?? 0) - (room?.connectedPlayers.length ?? 0))} more player(s).`}</p>
          </div>
        </section>

        <section className="seat-grid" aria-label="Room seats">
          {room ? Array.from({ length: room.requiredPlayers }, (_, index) => {
            const playerId = `P${index + 1}` as PlayerId;
            const connected = room.connectedPlayers.includes(playerId);
            return (
              <article className={connected ? "seat-card is-connected" : "seat-card"} key={playerId}>
                <span>{playerId}</span>
                <strong>{PLAYER_NAMES[playerId]}</strong>
                <small>{connected ? "Connected" : "Open seat"}</small>
              </article>
            );
          }) : <p>Connecting to room…</p>}
        </section>

        {room?.status === "active" && (
          <div className="online-ready-note">
            <strong>Room synchronized</strong>
            <span>The remote board-control screen is the next implementation pass. The authoritative room is ready and polling successfully.</span>
          </div>
        )}
        {error && <p className="online-error" role="alert">{error}</p>}
        <button className="leave-room-button" type="button" onClick={leaveRoom}>Forget this room on this tab</button>
      </main>
    );
  }

  const activePlayerIds = (["P1", "P2", "P3", "P4"] as const).slice(0, playerCount);
  return (
    <main className="online-shell">
      <header className="online-header">
        <div>
          <p className="eyebrow">Guest multiplayer</p>
          <h1>Play Tock online</h1>
        </div>
        <Link className="quiet-button" href="/">Local table</Link>
      </header>

      <div className="online-options-grid">
        <section className="online-panel">
          <p className="eyebrow">Host a table</p>
          <h2>Create room</h2>
          <label>
            <span>Players</span>
            <select value={playerCount} onChange={(event) => {
              const count = Number(event.target.value) as BoardPlayerCount;
              setPlayerCount(count);
              if (count !== 4) setTeams(false);
              if (dealer !== "random" && Number(dealer.slice(1)) > count) setDealer("random");
            }}>
              <option value={2}>2 players</option>
              <option value={3}>3 players</option>
              <option value={4}>4 players</option>
            </select>
          </label>
          <label className="online-check">
            <input type="checkbox" checked={teams} disabled={playerCount !== 4} onChange={(event) => setTeams(event.target.checked)} />
            <span>Opposite-seat teams</span>
          </label>
          <label>
            <span>First dealer</span>
            <select value={dealer} onChange={(event) => setDealer(event.target.value as PlayerId | "random")}>
              <option value="random">Random</option>
              {activePlayerIds.map((playerId) => <option value={playerId} key={playerId}>{PLAYER_NAMES[playerId]}</option>)}
            </select>
          </label>
          <button className="online-primary" type="button" disabled={busy} onClick={createRoom}>Create private room</button>
        </section>

        <section className="online-panel">
          <p className="eyebrow">Have a code?</p>
          <h2>Join room</h2>
          <label>
            <span>Six-character room code</span>
            <input value={joinCode} maxLength={6} autoCapitalize="characters" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="TOCK42" />
          </label>
          <button className="online-primary" type="button" disabled={busy || !joinCode.trim()} onClick={joinRoom}>Join next open seat</button>
          <p className="online-help">Your reconnect token stays in this browser tab. Share only the room code.</p>
        </section>
      </div>
      {error && <p className="online-error" role="alert">{error}</p>}
    </main>
  );
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The online request failed.";
}
