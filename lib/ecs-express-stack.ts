import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class EcsExpressStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Same table schema used across all three stacks — shortCode is the partition key
    const table = new dynamodb.Table(this, 'UrlTable', {
      tableName: 'url-shortener',
      partitionKey: { name: 'shortCode', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Task role — IAM identity the running container assumes to call DynamoDB.
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    table.grantReadWriteData(taskRole);

    // Execution role — used by ECS to pull the image from ECR and ship logs to CloudWatch.
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    // Infrastructure role — assumed by the Express Gateway service (not tasks) to
    // provision and manage the ALB, target groups, security groups, and auto-scaling.
    const infrastructureRole = new iam.Role(this, 'InfrastructureRole', {
      assumedBy: new iam.ServicePrincipal('ecs.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSInfrastructureRoleforExpressGatewayServices'
        ),
      ],
    });

    const repo = ecr.Repository.fromRepositoryName(this, 'Repo', 'url-shortener');

    // Service-linked roles required by Express Gateway Service to provision the ALB
    // and Application Auto Scaling. CfnServiceLinkedRole is idempotent — CloudFormation
    // returns the existing role ARN if it already exists, so this is safe on any account.
    const slrElb = new iam.CfnServiceLinkedRole(this, 'SlrElb', {
      awsServiceName: 'elasticloadbalancing.amazonaws.com',
    });
    const slrAutoscaling = new iam.CfnServiceLinkedRole(this, 'SlrAutoscaling', {
      awsServiceName: 'ecs.application-autoscaling.amazonaws.com',
    });

    // ECS Express Gateway Service — provisions the ALB, target groups, and auto-scaling
    // automatically. BASE_URL is omitted here because it's the service's own endpoint,
    // which is only known after creation (circular). Run `cdk deploy` a second time
    // after the first deploy to set BASE_URL to the ServiceEndpoint output value.
    const service = new ecs.CfnExpressGatewayService(this, 'Service', {
      serviceName: 'url-shortener',
      executionRoleArn: executionRole.roleArn,
      infrastructureRoleArn: infrastructureRole.roleArn,
      taskRoleArn: taskRole.roleArn,
      primaryContainer: {
        image: repo.repositoryUriForTag('latest'),
        containerPort: 3000,
        environment: [
          { name: 'TABLE_NAME', value: table.tableName },
        ],
      },
      healthCheckPath: '/health',
      scalingTarget: {
        minTaskCount: 1,
        maxTaskCount: 5,
      },
    });
    service.addDependency(slrElb);
    service.addDependency(slrAutoscaling);

    new cdk.CfnOutput(this, 'ServiceEndpoint', {
      value: service.attrEndpoint,
      description: 'ALB endpoint — set as BASE_URL in a second cdk deploy to complete wiring',
    });
  }
}
