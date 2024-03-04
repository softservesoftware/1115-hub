import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as efs from "aws-cdk-lib/aws-efs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import { App } from "aws-cdk-lib";

export interface networkStackProps extends cdk.StackProps {
}
export class networkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly eip: ec2.CfnEIP;
  readonly sftpListener: elbv2.NetworkListener;
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

    // Create a Network Load Balancer
    const nlb = new elbv2.NetworkLoadBalancer(this, "Nlb", {
      vpc: this.vpc,
      internetFacing: true,
    });

    // Allocate an Elastic IP and associate it with the NLB
    const eip = new ec2.CfnEIP(this, "Eip", {
      domain: "vpc",
    });
    const nlbEipAssociation = new ec2.CfnEIPAssociation(
      this,
      "NlbEipAssociation",
      {
        allocationId: eip.attrAllocationId,
        networkInterfaceId: nlb.loadBalancerCanonicalHostedZoneId, // This might need adjustment based on your setup
      },
    );

    // create listener for sftp
    this.sftpListener = nlb.addListener("sftpListener", {
      port: 22,
    });
  }
}

export interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  eip: ec2.CfnEIP;
  fileSystem: efs.FileSystem;
  sftpListener: elbv2.NetworkListener;
}

export class ComputeStack extends cdk.Stack {
  readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, "ElevenFifteenCluster", {
      vpc: props.vpc,
    });

    // create the sftp task definition
    const sftpTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "sftpTaskDef",
      {
        memoryLimitMiB: 512,
        cpu: 256,
      },
    );
    // add the efs volume to the task definition
    sftpTaskDefinition.addVolume({
      name: "sftp_data",
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId,
      },
    });

    // create the workflow task definition
    const workflowTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "workflowTaskDef",
      {
        memoryLimitMiB: 1024,
        cpu: 512,
      },
    );
    // add the efs volume to the task definition
    workflowTaskDefinition.addVolume({
      name: "sftp_data",
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId,
      },
    });

    // create the SFTP docker image & add to task definition
    const sftpContainer = sftpTaskDefinition.addContainer("sftpContainer", {
      image: ecs.ContainerImage.fromRegistry("atmoz/sftp"),
      command: [
        "qe1:pass:::ingress/",
        "qe2:pass:::ingress/",
        "qe3:pass:::ingress/",
        "qe4:pass:::ingress/",
        "qe5:pass:::ingress/",
        "qe6:pass:::ingress/",
      ],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "sftp" }),
      portMappings: [{ containerPort: 22, hostPort: 22 }],
    });

    sftpContainer.addMountPoints({
      containerPath: "/home",
      sourceVolume: "sftp_data",
      readOnly: false,
    });

    // Define a Docker image asset for the workflow container
    const workflowDockerImage = new ecrAssets.DockerImageAsset(
      this,
      "workflowImage",
      {
        directory: "./containers/", // Adjust this to the path of your Docker context
        file: "Dockerfile.workflow", // Specify the Dockerfile name
        buildArgs: {
          REPO_URL: "https://github.com/qe-collaborative-services/1115-hub.git",
        },
      },
    );

    // Add the workflow container using the image from ECR
    const workflowContainer = workflowTaskDefinition.addContainer(
      "workflowContainer",
      {
        image: ecs.ContainerImage.fromDockerImageAsset(workflowDockerImage),
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: "workflow" }),
      },
    );

    workflowContainer.addMountPoints({
      containerPath: "/SFTP",
      sourceVolume: "sftp_data",
      readOnly: false,
    });

    // create the sftp service
    const sftpService = new ecs.FargateService(this, "SftpService", {
      cluster,
      taskDefinition: sftpTaskDefinition,
      desiredCount: 1, // Adjust based on your needs
    });

    props.sftpListener.addTargets("sftpService", {
      port: 22,
      targets: [sftpService],
      healthCheck: {
        interval: cdk.Duration.seconds(240),
        timeout: cdk.Duration.seconds(5),
      },
    });

    // create the workflow service
    const workflowService = new ecs.FargateService(this, "WorkflowService", {
      cluster,
      taskDefinition: workflowTaskDefinition,
      desiredCount: 1, // Adjust based on your needs
    });
  }
}

export interface DataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class DataStack extends cdk.Stack {
  readonly fileSystem: efs.FileSystem;
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // Define the EFS filesystem
    this.fileSystem = new efs.FileSystem(this, "ElevenFifteenEfs", {
      vpc: props.vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}

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
    fileSystem: data.fileSystem,
    sftpListener: network.sftpListener,
  },
);

app.synth();
