#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { networkStack } from "./network.ts";
import { ComputeStack } from "./compute.ts";

const app = new cdk.App();
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
