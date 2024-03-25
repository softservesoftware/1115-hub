import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as efs from "aws-cdk-lib/aws-efs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { App } from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { FlowLogTrafficType } from "aws-cdk-lib/aws-ec2";

export interface ComputeStackProps extends cdk.StackProps {}

export class ComputeStack extends cdk.Stack {
  readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "VPC", { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    // Define a Docker image asset for the workflow container
    const workflowDockerImage = new ecrAssets.DockerImageAsset(
      this,
      "workflowImage",
      {
        directory: "./containers/workflow/", // Adjust this to the path of your Docker context
        file: "Dockerfile", // Specify the Dockerfile name
        buildArgs: {
          REPO_URL: "https://github.com/qe-collaborative-services/1115-hub.git",
        },
        platform: ecrAssets.Platform.LINUX_AMD64,
      }
    );

    // Create a load-balanced Fargate service and make it public
    const workflowService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        "workflowService",
        {
          cluster,
          desiredCount: 2,
          cpu: 256,
          memoryLimitMiB: 512,
          taskImageOptions: {
            image: ecs.ContainerImage.fromDockerImageAsset(workflowDockerImage),
            enableLogging: true,
            containerPort: 8081,
          },
          publicLoadBalancer: false,
          listenerPort: 8081,
          healthCheckGracePeriod: cdk.Duration.seconds(300),
        }
      );

    // Setup AutoScaling policy
    const workflowServiceScaling = workflowService.service.autoScaleTaskCount({
      maxCapacity: 2,
    });
    workflowServiceScaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 50,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // create a load-balanced Fargate service for the sftp container
    const sftpDockerImage = new ecrAssets.DockerImageAsset(this, "sftpImage", {
      directory: "./containers/sftp/", // Adjust this to the path of your Docker context
      file: "Dockerfile", // Specify the Dockerfile name
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    const sftpService = new ecsPatterns.NetworkLoadBalancedFargateService(
      this,
      "sftpService",
      {
        cluster,
        desiredCount: 2,
        cpu: 256,
        memoryLimitMiB: 512,
        taskImageOptions: {
          image: ecs.ContainerImage.fromDockerImageAsset(sftpDockerImage),
          enableLogging: true,
          containerPort: 22,
        },
        publicLoadBalancer: true,
        listenerPort: 22,
        healthCheckGracePeriod: cdk.Duration.seconds(300),
      }
    );

    // setup AutoScaling policy
    const sftpServiceScaling = sftpService.service.autoScaleTaskCount({
      maxCapacity: 2,
    });
    sftpServiceScaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 50,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });
  }
}

const app = new App();

const compute = new ComputeStack(
  app,
  `${process.env.ENV}ElevenFifteenCompute`,
  {}
);

app.synth();
