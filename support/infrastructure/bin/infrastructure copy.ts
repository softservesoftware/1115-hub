import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as efs from "aws-cdk-lib/aws-efs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import { Construct } from "constructs";
import { App } from "aws-cdk-lib";

export interface ComputeStackProps extends cdk.StackProps {}

export class ComputeStack extends cdk.Stack {
  readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // create a vpc that we can put an ec2 and rds instance into
    const vpc = new ec2.Vpc(this, "VPC", {
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
      vpc: vpc,
      internetFacing: true,
    });

    // Create a new security group for the NLB
    const nlbSecurityGroup = new ec2.SecurityGroup(this, "NlbSecurityGroup", {
      vpc,
    });

    // Allow inbound traffic on the NLB port
    nlbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8081),
      "Allow inbound traffic on the NLB port"
    );

    // Allow inbound traffic on the NLB port
    nlbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8082),
      "Allow inbound traffic on the NLB port"
    );

    // Allow inbound traffic on the NLB port
    nlbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow inbound traffic on the NLB port"
    );

    // Allow outbound traffic from the NLB
    nlbSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      "Allow outbound traffic from the NLB"
    );

    // Define the EFS filesystem
    const fileSystem = new efs.FileSystem(this, "ElevenFifteenEfs", {
      vpc: vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    // Create a new CloudWatch Logs group
    // If you need more granular control, you can create and attach a custom policy
    const logGroup = new logs.LogGroup(this, "ElevenFifteenComputeLogGroup", {
      logGroupName: "/ecs/elevenFifteenComputeLogs",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const logPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [logGroup.logGroupArn],
    });

    // Create a new IAM role for the SFTP service
    let sftpTaskExecutionRole = new iam.Role(this, "sftpTaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Role for SFTP tasks to interact with AWS services",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });
    sftpTaskExecutionRole.addToPolicy(logPolicy);

    // Create a new IAM role for the workflow service
    let workflowTaskExecutionRole = new iam.Role(
      this,
      "workflowTaskExecutionRole",
      {
        assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        description: "Role for workflow tasks to interact with AWS services",
      }
    );
    workflowTaskExecutionRole.addToPolicy(logPolicy);

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, "ElevenFifteenCluster", {
      vpc: vpc,
    });

    // create the sftp task definition
    const sftpTaskDefinition = new ecs.TaskDefinition(this, "sftpTaskDef", {
      compatibility: ecs.Compatibility.FARGATE,
      memoryMiB: "512",
      cpu: "256",
      taskRole: sftpTaskExecutionRole,
      networkMode: ecs.NetworkMode.AWS_VPC,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    // add the efs volume to the task definition
    sftpTaskDefinition.addVolume({
      name: "sftp_data",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      },
    });

    // create the workflow task definition
    const workflowTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "workflowTaskDef",
      {
        memoryLimitMiB: 1024,
        cpu: 512,
        executionRole: workflowTaskExecutionRole,
      }
    );

    // add the efs volume to the task definition
    workflowTaskDefinition.addVolume({
      name: "sftp_data",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      },
    });

    // create the sftp docker image
    const sftpDockerImage = new ecrAssets.DockerImageAsset(this, "sftpImage", {
      directory: "./containers/sftp/", // Adjust this to the path of your Docker context
      file: "Dockerfile", // Specify the Dockerfile name
    });

    // Define a Docker image asset for the sftp container
    const sftpContainer = sftpTaskDefinition.addContainer("sftpContainer", {
      image: ecs.ContainerImage.fromDockerImageAsset(sftpDockerImage),
      command: [
        "bronx:pass:::ingress/",
        "healtheconn:pass:::ingress/",
        "grrhio:pass:::ingress/",
        "healthix:pass:::ingress/",
        "healthelink:pass:::ingress/",
        "hixny:pass:::ingress/",
        "observe:pass:::log/",
      ],
      logging: new ecs.AwsLogDriver({
        logGroup: logGroup,
        streamPrefix: "sftp",
      }),
      portMappings: [
        { containerPort: 22 }, // SFTP port
        { containerPort: 8081 }, // Health check port
      ],
      linuxParameters: new ecs.LinuxParameters(this, "NodeExec", {
        initProcessEnabled: true,
      }),
    });

    // Add the mount points to the sftp container
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
        directory: "./containers/workflow/", // Adjust this to the path of your Docker context
        file: "Dockerfile", // Specify the Dockerfile name
        buildArgs: {
          REPO_URL: "https://github.com/qe-collaborative-services/1115-hub.git",
        },
      }
    );

    // Add the workflow container using the image from ECR
    const workflowContainer = workflowTaskDefinition.addContainer(
      "workflowContainer",
      {
        image: ecs.ContainerImage.fromDockerImageAsset(workflowDockerImage),
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: "workflow",
          logGroup: logGroup,
        }),
        portMappings: [
          { containerPort: 8080 }, // Health check port
        ],
      }
    );

    workflowContainer.addMountPoints({
      containerPath: "/SFTP",
      sourceVolume: "sftp_data",
      readOnly: false,
    });

    const albSg = new ec2.SecurityGroup(this, "SecurityGroupAlb", {
      vpc: vpc,
      allowAllOutbound: true,
    });

    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc: vpc,
      internetFacing: true,
      deletionProtection: false,
      ipAddressType: elbv2.IpAddressType.IPV4,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const httplistener = alb.addListener("HttpListener", {
      port: 80,
      open: true,
    });

    httplistener.addAction("HttpDefaultAction", {
      action: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        // host: "#{host}",
        path: "/",
        port: "443",
      }),
    });

    // create a security group for the ECS service
    const ecsSG = new ec2.SecurityGroup(this, "SFTPSecurityGroup", {
      vpc: vpc,
      allowAllOutbound: true,
    });

    ecsSG.addIngressRule(ec2.Peer.securityGroupId(), ec2.Port.tcp(8081));

    // create the sftp service
    const sftpService = new ecs.FargateService(this, "SftpService", {
      cluster,
      taskDefinition: sftpTaskDefinition,
      desiredCount: 1, // Adjust based on your needs
      securityGroups: [ecsSG],
    });
    // allow inbound traffic on the sftp port 22 and health check port 8081
    sftpService.connections.allowFromAnyIpv4(ec2.Port.tcp(22));
    sftpService.connections.allowFromAnyIpv4(ec2.Port.tcp(8081));
    // create the target group for the sftp service
    const sftpTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "SftpTargetGroup",
      {
        targets: [sftpService],
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: vpc,
        port: 80,
        deregistrationDelay: cdk.Duration.seconds(30),
        healthCheck: {
          path: "/",
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          interval: cdk.Duration.seconds(10),
          timeout: cdk.Duration.seconds(5),
          healthyHttpCodes: "200",
        },
      }
    );

    // create the workflow service
    const workflowService = new ecs.FargateService(this, "WorkflowService", {
      cluster,
      taskDefinition: workflowTaskDefinition,
      desiredCount: 1, // Adjust based on your needs
    });
    // allow inbound traffic on the health check port 8080
    workflowService.connections.allowFromAnyIpv4(ec2.Port.tcp(8080));

    // create listener for sftp service
    const sftpListener = nlb.addListener("sftpListener", {
      port: 8081,
    });
    // add the sftp service as a target
    sftpListener.addTargets("sftpService", {
      port: 8081,

      targets: [
        sftpService.loadBalancerTarget({
          containerName: "sftpContainer",
          containerPort: 8081,
        }),
      ],
      healthCheck: {
        interval: cdk.Duration.seconds(120),
        timeout: cdk.Duration.seconds(60),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        path: "/",
        protocol: elbv2.Protocol.HTTP,
      },
    });

    // create listener for workflow service
    const workflowListener = nlb.addListener("workflowListener", {
      port: 8082,
    });
    // add the workflow service as a target
    workflowListener.addTargets("workflowService", {
      port: 8082,
      targets: [
        workflowService.loadBalancerTarget({
          containerName: "workflowContainer",
          containerPort: 8080,
        }),
      ],
      healthCheck: {
        interval: cdk.Duration.seconds(120),
        timeout: cdk.Duration.seconds(60),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        path: "/",
        protocol: elbv2.Protocol.HTTP,
      },
    });

    // give the services access to the efs volume
    fileSystem.connections.allowDefaultPortFrom(sftpService);
    fileSystem.connections.allowDefaultPortFrom(workflowService);
  }
}

const app = new App();

const compute = new ComputeStack(
  app,
  `${process.env.ENV}ElevenFifteenCompute`,
  {}
);

app.synth();
