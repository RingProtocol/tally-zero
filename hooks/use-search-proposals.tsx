import { Contract, ethers } from "ethers";
import { useEffect, useState } from "react";

import { Proposal, UseSearchProposals } from "@/types/proposal";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";
import { env } from "../env";
import { CLUSTER_SIZE } from "../lib/utils";

const BLAST_RPC_URL = env.NEXT_PUBLIC_BLAST_RPC_URL || "https://rpc.blast.io";
const BLAST_BATCH_SIZE = 50;
const BLAST_BATCH_CONCURRENCY = 1;
const BLAST_BATCH_DELAY_MS = 6_500;
const governorBravoInterface = new ethers.utils.Interface([
  "function proposalCount() view returns (uint256)",
]);

export const useSearchProposals: UseSearchProposals = (
  provider,
  contractAddress,
  blockRange,
  startingBlock,
  enabled,
  networkId,
  snapshot,
  snapshotOnly
) => {
  const [searchProgress, setSearchProgress] = useState(0);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  const cancelSearch = () => {
    setSearchProgress(0);
    setProposals([]);
  };

  useEffect(() => {
    let cancelled = false;
    const historicalProposals = (snapshot?.proposals || []).map((proposal) => ({
      ...proposal,
      isHistorical: true,
    })) as Proposal[];
    setProposals(historicalProposals);
    setSyncError(null);

    if (snapshotOnly && snapshot) {
      setSearchProgress(100);
      return;
    }

    if (!enabled || !provider || !contractAddress || !startingBlock) {
      if (historicalProposals.length) setSearchProgress(100);
      return;
    }

    const contract = new Contract(contractAddress, OZGovernor_ABI, provider);

    const fetchProposals = async () => {
      try {
        let proposals: Proposal[] = [...historicalProposals];
        const currentBlock = await provider.getBlockNumber();
        const proposalCreatedFilter = contract.filters.ProposalCreated();
        // Blast's public RPC rejects eth_getLogs ranges over 10,000 blocks.
        const effectiveBlockRange = networkId === 81457 ? 10_000 : blockRange;
        const startBlock = snapshot
          ? snapshot.syncedToBlock + 1
          : Math.max(startingBlock - effectiveBlockRange * CLUSTER_SIZE, 0);

        if (startBlock > currentBlock) {
          setSearchProgress(100);
          return cancelSearch;
        }

        const parseProposal = (args: ethers.utils.Result): Proposal => {
          const {
            proposalId,
            proposer,
            targets,
            values,
            signatures,
            calldatas,
            startBlock,
            endBlock,
            description,
          } = args;

          return {
            id: proposalId.toString(),
            contractAddress,
            proposer,
            targets,
            values: Array.isArray(args[3])
              ? args[3].map((value: ethers.BigNumber) => value.toString())
              : [],
            signatures,
            calldatas,
            startBlock: startBlock.toString(),
            endBlock: endBlock.toString(),
            description,
            state: 0,
          };
        };

        if (networkId === 81457) {
          const topic = contract.interface.getEventTopic("ProposalCreated");
          const requests = [];
          let expectedProposalCount: number | undefined;
          try {
            const result = await provider.call({
              to: contractAddress,
              data: governorBravoInterface.encodeFunctionData("proposalCount"),
            });
            expectedProposalCount = governorBravoInterface
              .decodeFunctionResult("proposalCount", result)[0]
              .toNumber();
          } catch {
            // Not every Governor implementation exposes proposalCount().
          }

          for (
            let fromBlock = startBlock, id = 1;
            fromBlock <= currentBlock;
            fromBlock += effectiveBlockRange, id++
          ) {
            requests.push({
              jsonrpc: "2.0",
              id,
              method: "eth_getLogs",
              params: [
                {
                  address: contractAddress,
                  topics: [topic],
                  fromBlock: ethers.utils.hexValue(fromBlock),
                  toBlock: ethers.utils.hexValue(
                    Math.min(fromBlock + effectiveBlockRange - 1, currentBlock)
                  ),
                },
              ],
            });
          }

          const batches = [];
          for (
            let index = 0;
            index < requests.length;
            index += BLAST_BATCH_SIZE
          ) {
            batches.push(requests.slice(index, index + BLAST_BATCH_SIZE));
          }

          let completedBatches = 0;
          const liveProposals: Proposal[] = [];
          for (
            let index = 0;
            index < batches.length && !cancelled;
            index += BLAST_BATCH_CONCURRENCY
          ) {
            const wave = batches.slice(index, index + BLAST_BATCH_CONCURRENCY);
            const waveResponses = await Promise.all(
              wave.map(async (batch) => {
                const response = await fetch(BLAST_RPC_URL, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(batch),
                });
                if (!response.ok) {
                  throw new Error(`Blast RPC returned HTTP ${response.status}`);
                }
                const result = await response.json();
                completedBatches++;
                setSearchProgress((completedBatches / batches.length) * 100);
                return result;
              })
            );
            const waveProposals = waveResponses.flat().flatMap((response) => {
              if (response.error) {
                throw new Error(
                  `Blast RPC log query failed: ${response.error.message}`
                );
              }
              return (response.result || []).map((log: ethers.providers.Log) =>
                parseProposal(contract.interface.parseLog(log).args)
              );
            });
            liveProposals.push(...waveProposals);

            const mergedProposals = Array.from(
              new Map(
                [...historicalProposals, ...liveProposals].map((proposal) => [
                  proposal.id,
                  proposal,
                ])
              ).values()
            );
            if (!cancelled) setProposals(mergedProposals);

            if (
              expectedProposalCount !== undefined &&
              liveProposals.length >= expectedProposalCount
            ) {
              break;
            }

            if (index + BLAST_BATCH_CONCURRENCY < batches.length) {
              await new Promise((resolve) =>
                setTimeout(resolve, BLAST_BATCH_DELAY_MS)
              );
            }
          }

          proposals = Array.from(
            new Map(
              [...historicalProposals, ...liveProposals].map((proposal) => [
                proposal.id,
                proposal,
              ])
            ).values()
          );
          setProposals(proposals);
          setSearchProgress(100);
          return cancelSearch;
        }

        for (
          let fromBlock = startBlock;
          fromBlock <= currentBlock && !cancelled;
          fromBlock += effectiveBlockRange
        ) {
          const toBlock = Math.min(
            fromBlock + effectiveBlockRange - 1,
            currentBlock
          );

          setSearchProgress(
            ((fromBlock - startBlock) / (currentBlock - startBlock)) * 100
          );

          let events: Array<ethers.Event> = [];
          try {
            events = await contract.queryFilter(
              proposalCreatedFilter,
              fromBlock,
              toBlock
            );
          } catch (error) {
            events = [];
            console.warn("Error parsing proposals:", error);
          }

          const newProposals = events.map((event) =>
            parseProposal(event.args as ethers.utils.Result)
          );
          if (newProposals.length > 0) {
            proposals = [...proposals, ...newProposals];
          }
        }

        if (!cancelled) {
          setProposals(proposals);
          setSearchProgress(100);
        }
        return cancelSearch;
      } catch (error) {
        if (cancelled) return;
        console.warn("Error fetching proposals:", error);
        setSyncError(
          error instanceof Error ? error.message : "Unable to reach RPC"
        );
        if (historicalProposals.length) {
          setProposals(historicalProposals);
          setSearchProgress(100);
        }
      }
    };

    fetchProposals().catch(console.warn);

    return () => {
      cancelled = true;
    };
  }, [
    provider,
    contractAddress,
    startingBlock,
    enabled,
    blockRange,
    networkId,
    snapshot,
    snapshotOnly,
  ]);

  return { proposals, searchProgress, syncError };
};
