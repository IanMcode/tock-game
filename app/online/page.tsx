import OnlineLobby from "./online-lobby";

export default function OnlinePage() {
  return <OnlineLobby realtimeEnabled={Boolean(process.env.ABLY_API_KEY)} />;
}
