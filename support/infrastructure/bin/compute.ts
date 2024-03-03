#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  eip: ec2.CfnEIP;
  efs: ec2.FileSystem;
}

export class ComputeStack extends cdk.Stack {
  readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // Security Group for compute EC2
    const ec2SecurityGroup = new ec2.SecurityGroup(this, "Ec2SecurityGroup", {
      vpc: props.vpc,
      description: "Security group for compute EC2 instance",
      allowAllOutbound: true,
    });

    // Allow SCP/SFTP access on port 2222 from any IP
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(2222),
      "Allow SCP/SFTP access on port 2222 from any IP",
    );

    // Allow SSH access from a specific IP range, all for now
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access from a specific block",
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allows HTTPS access from Internet",
    );

    // IAM Role for the EC2 Instance
    const role = new iam.Role(this, "Ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      // Add necessary managed policies or inline policies here
    });

    const userData = ec2.UserData.forLinux();
    // run commands on the instance for initial setup

    // create random string, forces the instance to run the commands on every deployment
    // less than ideal but works for now (until proper containerized deployment is implemented)
    // avoids the need of separate stacks and cdk destroy/ deploy on instance changes
    const randomString = Math.floor(Date.now() / 1000);

    userData.addCommands(
      `echo deployment: ${randomString} > /etc/deployment.txt`,
      "apt-get update -y",
      "apt-get install -y ca-certificates curl nfs-common",
      "mkdir /mnt/efs",
      `echo "${props.efs.fileSystemId}.efs.${process.env.CDK_DEFAULT_REGION}.amazonaws.com:/ /mnt/efs nfs defaults 0 0" >> /etc/fstab`,
      "mount -a",
      "install -m 0755 -d /etc/apt/keyrings",
      "curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc",
      "chmod a+r /etc/apt/keyrings/docker.asc",
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
      "apt-get update",
      "apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y",
      "curl -Ssf https://pkgx.sh | sh",
      "install -m 755 pkgx /usr/local/bin",
      "export PATH=$PATH:/home/admin/.local/bin",
      "pkgx install git",
      "export PATH=$PATH:/home/admin/.local/bin",
      "git clone https://github.com/qe-collaborative-services/1115-hub.git",
      "cd 1115-hub/support/infrastructure/containers",
      "docker compose up --build",
    );

    // EC2 Instance
    this.instance = new ec2.Instance(this, "ElevenFifteenComputeInstance", {
      vpc: props.vpc,
      instanceType: new ec2.InstanceType("t3.micro"),
      machineImage: ec2.MachineImage.genericLinux({
        "us-east-1": "ami-0133fb3dded749b65", // debian bullseye latest amd64
        // ...add other regions if necessary
        // view other ids here: https://wiki.debian.org/Cloud/AmazonEC2Image
      }),
      securityGroup: ec2SecurityGroup,
      role: role,
      userData: userData,
      // keyName is a temporary solution for testing
      // keyName: "keys",
      // should use a key pair for production (or not include to block ssh access)
      // keyPair: new ec2.KeyPair(this, "ComputeInstanceKeyPair", {}),
      vpcSubnets: {
        subnetGroupName: "compute-subnet",
      },
    });
    // Associate the Elastic IP with the EC2 Instance
    new ec2.CfnEIPAssociation(this, "EIPAssociation", {
      eip: props.eip.ref, // Reference to the EIP resource
      instanceId: this.instance.instanceId,
    });
  }
}