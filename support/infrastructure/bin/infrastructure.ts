import * as cdk from "aws-cdk-lib/core";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

interface ComputeStackProps extends StackProps {
  // vpc: ec2.IVpc;
  // database: rds.ServerlessCluster;
}

class ComputeStack extends Stack {
  readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // Create a VPC
    const vpc = new ec2.Vpc(this, "ElevenFifteenVpc", { maxAzs: 2 });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, "ElevenFifteenCluster", { vpc });

    // Define the EFS filesystem
    const fileSystem = new efs.FileSystem(this, "ElevenFifteenEfs", {
      vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Define the sftp task definition
    const sftpTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "sftpTaskDef",
      {
        memoryLimitMiB: 512,
        cpu: 256,
      },
    );

    // Add the sftp container
    sftpTaskDefinition.addContainer("sftpContainer", {
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
    }).addMountPoints({
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

    // Define the workflow task definition for the 1115 Hub with the ECR image
    const workflowTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "workflowTaskDef",
      {
        memoryLimitMiB: 1024,
        cpu: 512,
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

    // Create the EFS volume
    const volume = {
      name: "sftp_data",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      },
    };

    // Add the volume to the task definitions
    sftpTaskDefinition.addVolume(volume);
    workflowTaskDefinition.addVolume(volume);

    // Creating a Network Load Balancer (NLB) as it's more suitable for SFTP (TCP traffic)
    const nlb = new elbv2.NetworkLoadBalancer(this, "sftpNlb", {
      vpc,
      internetFacing: true,
    });
    // Create a target group
    const targetGroup = new elbv2.NetworkTargetGroup(this, "sftpTargetGroup", {
      vpc,
      port: 22,
      protocol: elbv2.Protocol.TCP,
      targetType: elbv2.TargetType.IP, // Specify target type as IP
    });

    const sftpService = new ecs.FargateService(this, "sftpService", {
      cluster,
      taskDefinition: sftpTaskDefinition,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets:
            vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds,
          assignPublicIp: true, // Set to true if your tasks need to access the internet directly
        },
      },
    });

    sftpService.attachToNetworkTargetGroup(targetGroup);

    new ecs.FargateService(this, "workflowService", {
      cluster,
      taskDefinition: workflowTaskDefinition,
    });
  }
}

const app = new cdk.App();
new ComputeStack(app, "ElevenFifteenEcsStack", {});
