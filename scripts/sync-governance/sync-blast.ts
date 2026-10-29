import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { ethers } from "ethers";

import GovernorABI from "../../data/OzGovernor_ABI.json";

const RPC_URL = process.env.BLAST_RPC_URL || "https://rpc.blast.io";
const NETWORK_ID = 81457;
const CONTRACT_ADDRESS = "0xd2F37FF7eCfAcEB4De1A2bAcb8D9C539A4D6a943";
const DEPLOYMENT_BLOCK = 706250;
const BLOCK_RANGE = 10_000;
const REQUESTS_PER_BATCH = 50;
const BATCH_DELAY_MS = 6_500;
const OUTPUT_PATH = path.resolve("data/governance/blast-81457-ring-dao.json");
const CHECKPOINT_PATH = `${OUTPUT_PATH}.checkpoint`;

type RpcResponse<T> = {
  id: number;
  result?: T;
  error?: { code: number; message: string };
};

type SnapshotProposal = {
  id: string;
  contractAddress: string;
  proposer: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  startBlock: string;
  endBlock: string;
  description: string;
  state: number;
  eventBlock: number;
  transactionHash: string;
};

type Snapshot = {
  version: 1;
  networkId: number;
  chainName: string;
  contractAddress: string;
  governorName: string;
  deploymentBlock: number;
  syncedToBlock: number;
  syncedAt: string;
  proposals: SnapshotProposal[];
};

const governorInterface = new ethers.utils.Interface(GovernorABI);
const bravoInterface = new ethers.utils.Interface([
  "function proposalCount() view returns (uint256)",
]);

async function rpc<T>(body: object, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw lastError;
}

async function readCheckpoint(): Promise<Snapshot | undefined> {
  try {
    return JSON.parse(await readFile(CHECKPOINT_PATH, "utf8")) as Snapshot;
  } catch {
    return undefined;
  }
}

async function saveCheckpoint(snapshot: Snapshot) {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(CHECKPOINT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
}

async function main() {
  const blockResponse = await rpc<RpcResponse<string>>({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_blockNumber",
    params: [],
  });
  if (!blockResponse.result) throw new Error("Unable to read latest block");
  const latestBlock = Number(blockResponse.result);
  const countResponse = await rpc<RpcResponse<string>>({
    jsonrpc: "2.0",
    id: 2,
    method: "eth_call",
    params: [
      {
        to: CONTRACT_ADDRESS,
        data: bravoInterface.encodeFunctionData("proposalCount"),
      },
      "latest",
    ],
  });
  const expectedProposalCount = countResponse.result
    ? bravoInterface
        .decodeFunctionResult("proposalCount", countResponse.result)[0]
        .toNumber()
    : undefined;

  const checkpoint = await readCheckpoint();
  const snapshot: Snapshot = checkpoint || {
    version: 1,
    networkId: NETWORK_ID,
    chainName: "Blast",
    contractAddress: CONTRACT_ADDRESS,
    governorName: "Ring DAO",
    deploymentBlock: DEPLOYMENT_BLOCK,
    syncedToBlock: DEPLOYMENT_BLOCK - 1,
    syncedAt: new Date(0).toISOString(),
    proposals: [],
  };

  const topic = governorInterface.getEventTopic("ProposalCreated");
  let nextBlock = Math.max(snapshot.syncedToBlock + 1, DEPLOYMENT_BLOCK);
  let requestId = 1;

  while (nextBlock <= latestBlock) {
    const requests = [];
    let batchEnd = nextBlock;
    for (
      let index = 0;
      index < REQUESTS_PER_BATCH && batchEnd <= latestBlock;
      index++
    ) {
      const fromBlock = batchEnd;
      const toBlock = Math.min(fromBlock + BLOCK_RANGE - 1, latestBlock);
      requests.push({
        jsonrpc: "2.0",
        id: requestId++,
        method: "eth_getLogs",
        params: [
          {
            address: CONTRACT_ADDRESS,
            topics: [topic],
            fromBlock: ethers.utils.hexValue(fromBlock),
            toBlock: ethers.utils.hexValue(toBlock),
          },
        ],
      });
      batchEnd = toBlock + 1;
    }

    let responses: Array<RpcResponse<ethers.providers.Log[]>> = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      responses =
        await rpc<Array<RpcResponse<ethers.providers.Log[]>>>(requests);
      const errors = responses.filter((response) => response.error);
      if (!errors.length) break;
      const message = errors[0].error?.message || "Unknown RPC error";
      if (message.includes("request limit") && attempt < 5) {
        console.warn(
          "RPC rate limit reached; waiting 65 seconds before retrying"
        );
        await new Promise((resolve) => setTimeout(resolve, 65_000));
        continue;
      }
      throw new Error(`RPC log query failed: ${message}`);
    }

    for (const log of responses.flatMap((response) => response.result || [])) {
      const { args } = governorInterface.parseLog(log);
      snapshot.proposals.push({
        id: args.proposalId.toString(),
        contractAddress: CONTRACT_ADDRESS,
        proposer: args.proposer,
        targets: args.targets,
        // Result.values is Array.prototype.values, so access the ABI field by index.
        values: args[3].map((value: ethers.BigNumber) => value.toString()),
        signatures: args.signatures,
        calldatas: args.calldatas,
        startBlock: args.startBlock.toString(),
        endBlock: args.endBlock.toString(),
        description: args.description,
        state: 0,
        eventBlock: Number(log.blockNumber),
        transactionHash: log.transactionHash,
      });
    }

    snapshot.syncedToBlock = batchEnd - 1;
    snapshot.syncedAt = new Date().toISOString();
    snapshot.proposals = Array.from(
      new Map(
        snapshot.proposals.map((proposal) => [proposal.id, proposal])
      ).values()
    );
    await saveCheckpoint(snapshot);
    console.log(
      `Synced through ${snapshot.syncedToBlock}/${latestBlock}; ${snapshot.proposals.length}/${expectedProposalCount ?? "?"} proposals`
    );
    if (
      expectedProposalCount !== undefined &&
      snapshot.proposals.length >= expectedProposalCount
    ) {
      // Governor Bravo proposal IDs are sequential and proposalCount is the
      // authoritative total, so finding every event proves the snapshot is
      // complete without scanning millions of later empty blocks.
      snapshot.syncedToBlock = latestBlock;
      await saveCheckpoint(snapshot);
      break;
    }
    nextBlock = batchEnd;
    await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
  }

  for (let index = 0; index < snapshot.proposals.length; index += 20) {
    const proposals = snapshot.proposals.slice(index, index + 20);
    const requests = proposals.map((proposal, offset) => ({
      jsonrpc: "2.0",
      id: offset + 1,
      method: "eth_call",
      params: [
        {
          to: CONTRACT_ADDRESS,
          data: governorInterface.encodeFunctionData("state", [proposal.id]),
        },
        "latest",
      ],
    }));
    const responses = await rpc<Array<RpcResponse<string>>>(requests);
    responses.forEach((response, offset) => {
      if (response.result) {
        snapshot.proposals[index + offset].state = Number(
          governorInterface.decodeFunctionResult("state", response.result)[0]
        );
      }
    });
  }

  snapshot.syncedAt = new Date().toISOString();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(CHECKPOINT_PATH, `${CHECKPOINT_PATH}.complete`).catch(() => {});
  console.log(`Wrote ${snapshot.proposals.length} proposals to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
