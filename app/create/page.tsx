import OnlineLobby from "../online/online-lobby";
import { getAblyApiKey } from "../../src/online/environment";

export default function CreateGamePage() {
  return <OnlineLobby realtimeEnabled={Boolean(getAblyApiKey())} entryMode="create" />;
}
