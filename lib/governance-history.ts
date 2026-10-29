import blastRingDao from "@data/governance/blast-81457-ring-dao.json";

import { GovernanceSnapshot } from "@/types/proposal";

const snapshots = [blastRingDao] as GovernanceSnapshot[];

export function getGovernanceSnapshot(
  networkId?: number,
  contractAddress?: string
) {
  if (!networkId || !contractAddress) return undefined;
  return snapshots.find(
    (snapshot) =>
      snapshot.networkId === networkId &&
      snapshot.contractAddress.toLowerCase() === contractAddress.toLowerCase()
  );
}
