import { createGame } from "../src/game/createGame";
import GameTable from "./game-table";

export default function Home() {
  return <GameTable initialGame={createGame()} />;
}
