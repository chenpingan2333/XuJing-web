import { ChatClient } from "./ChatClient";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  return <ChatClient characterId={characterId} />;
}