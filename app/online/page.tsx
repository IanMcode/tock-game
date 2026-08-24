import OnlineLobby from "./online-lobby";
import { getAblyApiKey } from "../../src/online/environment";

export default function OnlinePage() {
  return <OnlineLobby realtimeEnabled={Boolean(getAblyApiKey())} />;
}
