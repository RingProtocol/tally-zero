"use client";

import {
  EthereumClient,
  w3mConnectors,
  w3mProvider,
} from "@web3modal/ethereum";
import { Web3Modal } from "@web3modal/react";
import { WagmiConfig, configureChains, createClient } from "wagmi";
import { publicProvider } from "wagmi/providers/public";
import { env } from "../env";

import { chains } from "@config/chains";

export function Web3ModalProvider({ children }: { children: React.ReactNode }) {
  const projectId = env.NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID;

  const providers = projectId
    ? [w3mProvider({ projectId }), publicProvider()]
    : [publicProvider()];
  const { provider } = configureChains(chains, providers);
  const wagmiClient = createClient({
    autoConnect: true,
    connectors: projectId ? w3mConnectors({ projectId, chains }) : [],
    provider,
  });

  const ethereumClient = new EthereumClient(wagmiClient, chains);

  return (
    <>
      <WagmiConfig client={wagmiClient}>{children}</WagmiConfig>
      {projectId && (
        <Web3Modal projectId={projectId} ethereumClient={ethereumClient} />
      )}
    </>
  );
}
