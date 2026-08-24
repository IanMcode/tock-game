import OnlineLobby from "../online/online-lobby";
import { getAblyApiKey } from "../../src/online/environment";

export default function JoinGamePage() {
  return <OnlineLobby realtimeEnabled={Boolean(getAblyApiKey())} entryMode="join" />;
}
