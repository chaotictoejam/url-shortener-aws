import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';

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

    // Builds the image from ecs-express/ and pushes it to the CDK bootstrap ECR
    // repository on every `cdk deploy`. Requires Docker running locally.
    const image = new DockerImageAsset(this, 'AppImage', {
      directory: path.join(__dirname, '../ecs-express'),
    });

    // BASE_URL is the service's own endpoint — only known after first deploy.
    // Pass --context baseUrl=<ServiceEndpoint> on a second deploy to wire it.
    const baseUrl = this.node.tryGetContext('baseUrl') as string | undefined;
    const environment: ecs.CfnExpressGatewayService.KeyValuePairProperty[] = [
      { name: 'TABLE_NAME', value: table.tableName },
    ];
    if (baseUrl) {
      environment.push({ name: 'BASE_URL', value: baseUrl });
    }

    const service = new ecs.CfnExpressGatewayService(this, 'Service', {
      serviceName: 'url-shortener',
      executionRoleArn: executionRole.roleArn,
      infrastructureRoleArn: infrastructureRole.roleArn,
      taskRoleArn: taskRole.roleArn,
      primaryContainer: {
        image: image.imageUri,
        containerPort: 3000,
        environment,
      },
      healthCheckPath: '/health',
      scalingTarget: {
        minTaskCount: 1,
        maxTaskCount: 5,
      },
    });

    new cdk.CfnOutput(this, 'ServiceEndpoint', {
      value: service.attrEndpoint,
      description: 'ALB endpoint — re-deploy with --context baseUrl=<this value> to wire BASE_URL',
    });
  }
}
