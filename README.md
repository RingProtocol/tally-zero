![hero](/public/og.png)

<p align="center">
	<h1 align="center"><b>TallyZero</b></h1>
<p align="center">
    Decentralized Voting Made Simple
    <br />
    <br />
    <a href="https://tally-zero-preview.vercel.app/">Website</a>
    ·
    <a href="https://github.com/withtally/tally-zero/issues">Issues</a>
  </p>
</p>

# What is TallyZero

> A robust, open-source platform for onchain voting, Tally Zero ensures accessibility and transparency, leveraging React and IPFS for true decentralization.

# App Architecture

- Yarn
- React
- TypeScript
- Nextjs
- TailwindCSS

### Hosting

- Fleek (IPFS Hosting, deployment, build)
- Github (Codebase, issues, PRs, actions)

### Services

- Github Actions (CI/CD)
- Web3Modal (Wallet connection)
- Ethers (Fetching proposals)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=withtally/tally-zero&type=Date)](https://star-history.com/#withtally/tally-zero&Date)

# Essential Guidelines

The app can run in read-only mode without environment variables. To enable wallet connection, create a project at [WalletConnect Cloud](https://cloud.walletconnect.com/sign-in), then set `NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID` in `.env.local` or in your hosting provider.

## Governance history snapshots

The Ring DAO page on Blast offers two explicit data sources. **Backup data**
loads `data/governance/blast-81457-ring-dao.json` without making an RPC request,
so proposals remain available when the chain is offline. **Live RPC rescan**
ignores the snapshot and scans `ProposalCreated` events again from the contract
deployment block, updating the table as batches arrive.

Refresh the committed snapshot before deploying when needed:

```bash
pnpm sync:blast-governance
```

The command writes a resumable `.checkpoint` file while scanning and produces
the JSON snapshot when complete. Set `BLAST_RPC_URL` to use a different archive
RPC. Commit the generated JSON with the application; Vercel needs no database
or server-side function for historical data. To use a different RPC for live
browser sync on Vercel, set `NEXT_PUBLIC_BLAST_RPC_URL` in the project
environment variables.

The project's pages are located in the `/app` directory, with components organized as follows:

- `container`: Components related to the interface
- `form`: All forms are housed here
- `navigation`: Components associated with the layout
- `section`: Components for the marketing page
- `table`: Self explanatory
- `ui`: Components from [Shadcn UI](https://ui.shadcn.com/)

The `/config` folder is crucial for maintenance purposes:

- `chains.ts`: Contains all chains for Web3Modal connection
- `data.ts`: Lists the chains supported by Tally Zero (refer to the image). You can add as many as required.

![Supported Chains](/public/readme/chain.png)

Lastly, the `/data` folder contains the ABI for TallyZero.
