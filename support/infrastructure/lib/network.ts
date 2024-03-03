#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface networkStackProps extends cdk.StackProps {
}
export class networkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly eip: ec2.CfnEIP;
  constructor(scope: Construct, id: string, props: networkStackProps) {
    super(scope, id, props);
    // create a vpc that we can put an ec2 and rds instance into
    this.vpc = new ec2.Vpc(this, "VPC", {
      maxAzs: 3, // Default is all AZs in region
      subnetConfiguration: [
        // we should also create a management subnet eventually
        {
          cidrMask: 24,
          name: "compute-subnet",
          // when management infra is created, this can be PRIVATE_ISOLATED instead
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "data-subnet",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // Allocate an Elastic IP
    this.eip = new ec2.CfnEIP(this, "EIP");

    // create export for the EIP
    new cdk.CfnOutput(this, "instanceIP", {
      value: this.eip.ref,
      description: "The Elastic IP for the compute instance",
    });
  }
}
