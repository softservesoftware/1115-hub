#!/usr/bin/env node
import { App } from "npm:aws-cdk-lib";
import { networkStack } from "../lib/network.ts";
import { ComputeStack } from "../lib/compute.ts";
import { DataStack } from "../lib/data.ts";
const app = new App();
const network = new networkStack(
  app,
  `${process.env.ENV}ElevenFifteenNetwork`,
  {},
);
const data = new DataStack(
  app,
  `${process.env.ENV}ElevenFifteenData`,
  {
    vpc: network.vpc,
  },
);
const compute = new ComputeStack(
  app,
  `${process.env.ENV}ElevenFifteenCompute`,
  {
    vpc: network.vpc,
    eip: network.eip,
    efs: data.efs,
  },
);

app.synth();
