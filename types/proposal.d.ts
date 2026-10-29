import { Address } from "@/types/search";

export type Proposal = {
  id: string;
  contractAddress: Address;
  proposer: string;
  targets: string[];
  values: ethers.BigNumber[];
  signatures: string[];
  calldatas: string[];
  startBlock: ethers.BigNumber;
  endBlock: ethers.BigNumber;
  description: string;
  state: number;
  isHistorical?: boolean;
};

export type GovernanceSnapshot = {
  version: number;
  networkId: number;
  chainName: string;
  contractAddress: string;
  governorName: string;
  deploymentBlock: number;
  syncedToBlock: number;
  syncedAt: string;
  proposals: Array<Proposal & { eventBlock: number; transactionHash: string }>;
};

export type UseSearchProposals = (
  provider: ethers.providers.Provider | undefined,
  contract: Address | undefined,
  blockRange: number,
  startingBlock: number | null,
  enabled: boolean,
  networkId?: number,
  snapshot?: GovernanceSnapshot,
  snapshotOnly?: boolean
) => {
  proposals: Proposal[];
  searchProgress: number;
  syncError: string | null;
};

export type ParsedProposal = {
  id: string;
  contractAddress: Address;
  proposer: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  startBlock: string;
  endBlock: string;
  description: string;
  networkId: string;
  state: ProposalState | undefined;
};

export type UseTotalProposalsReturn = {
  totalProposals: number | null;
  isLoadingTotal: boolean;
  error: Error | null;
};
