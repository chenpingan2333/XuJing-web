"use client";

import React from "react";
import { ChatClient } from "./ChatClient";

export default function ChatPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  // React.use(params) must be the absolute first Hook call
  const { characterId } = React.use(params);
  return <ChatClient characterId={characterId} />;
}
