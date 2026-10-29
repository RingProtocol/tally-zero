"use client";

import { useEffect, useState } from "react";
import * as z from "zod";

import { Form } from "@/components/ui/Form";
import { ContractParams } from "@/types/search";
import { formSchema } from "@config/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import ContractCard from "@/components/container/ContractCard";
import { columns } from "@/components/table/ColumnsProposals";
import { DataTable } from "@/components/table/DataTable";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";

import { State } from "@/types/search";
import { initialState } from "@config/intial-state";
import { useGovernorContract } from "@hooks/use-governor-contract";

export default function Search() {
  const [state, setState] = useState<State>(initialState);
  const [dataSource, setDataSource] = useState<"snapshot" | "live">("snapshot");
  const [formContractParams, setFormContractParams] = useState<ContractParams>(
    {}
  );

  useEffect(() => {
    if (formContractParams.contractAddress && formContractParams.networkId) {
      setState((prevState) => ({
        ...prevState,
        governor: {
          ...prevState.governor,
          address: formContractParams.contractAddress,
        },
      }));
    }
  }, [formContractParams, setState]);

  const { overallProgress, formattedProposals, syncError, snapshot } =
    useGovernorContract({
      values: formContractParams,
      state,
      setState,
      dataSource,
    });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      address: "0xd2F37FF7eCfAcEB4De1A2bAcb8D9C539A4D6a943",
      networkId: "81457",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setState(initialState);

    setFormContractParams({
      contractAddress: `0x${values.address.slice(2)}`,
      networkId: parseInt(values.networkId),
      deploymentBlock: values.deploymentBlock || 0,
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col space-y-4"
      >
        <div className="flex flex-col gap-3 rounded-xl border bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">Data source</div>
            <div className="text-sm text-muted-foreground">
              Use the committed backup instantly, or rescan the chain from the
              deployment block.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={dataSource === "snapshot" ? "default" : "outline"}
              onClick={() => setDataSource("snapshot")}
            >
              Backup data
            </Button>
            <Button
              type="button"
              variant={dataSource === "live" ? "default" : "outline"}
              onClick={() => setDataSource("live")}
            >
              Live RPC rescan
            </Button>
          </div>
        </div>

        <ContractCard
          form={form}
          progress={overallProgress}
          governorName={state.governor.name}
        />

        <section id="proposals-table">
          {snapshot && (
            <div className="mb-4 rounded-md border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              Historical snapshot: {snapshot.proposals.length} proposals through
              block {snapshot.syncedToBlock}. Loaded directly from the
              repository backup. No RPC request was made.
            </div>
          )}
          {dataSource === "live" && formContractParams.contractAddress && (
            <div className="mb-4 rounded-md border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              {syncError
                ? `Live RPC sync failed: ${syncError}`
                : overallProgress < 100
                  ? "Live RPC: rescanning from the contract deployment block…"
                  : "Live RPC rescan complete."}
            </div>
          )}
          {overallProgress > 0 && overallProgress < 100 && (
            <Progress className="mb-8" value={overallProgress} />
          )}

          {(overallProgress === 100 || formattedProposals.length > 0) && (
            <DataTable
              isPaginated={true}
              columns={columns}
              data={formattedProposals as any[]}
            />
          )}
        </section>
      </form>
    </Form>
  );
}
