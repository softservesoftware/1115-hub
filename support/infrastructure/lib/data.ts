#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface DataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class DataStack extends cdk.Stack {
  readonly efsMountTarget: ec2.CfnMountTarget;
  readonly efs: ec2.FileSystem;
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // Create an EFS file system in the data subnet
    this.efs = new ec2.FileSystem(this, "EfsFileSystem", {
      vpc: props.vpc,
      lifecyclePolicy: ec2.LifecyclePolicy.AFTER_7_DAYS, // Adjust this as necessary
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Be cautious with this in production environments
    });

    // Create a security group for the EFS
    const efsSecurityGroup = new ec2.SecurityGroup(this, "EfsSecurityGroup", {
      vpc: props.vpc,
      description: "Security group for EFS",
      allowAllOutbound: true,
    });

    // Allow NFS access from the compute subnet by allowing the entire VPC CIDR
    // Consider narrowing this down for tighter security, e.g., only allowing the compute subnet's CIDR
    efsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(2049),
      "Allow NFS access from within the VPC",
    );

    // Create mount targets in the data subnet
    this.efsMountTarget = new ec2.CfnMountTarget(this, "EfsMountTarget", {
      fileSystemId: efs.fileSystemId,
      securityGroups: [efsSecurityGroup.securityGroupId],
      // Adjusted to select the 'data-subnet'
      subnetId: props.vpc.selectSubnets({ subnetGroupName: "data-subnet" })
        .subnetIds[0],
    });
  }
}
