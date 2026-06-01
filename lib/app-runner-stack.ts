import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';

export class AppRunnerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Same DynamoDB table as the other approaches
    const table = new dynamodb.Table(this, 'UrlTable', {
      tableName: 'url-shortener',
      partitionKey: { name: 'shortCode', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Instance role: App Runner assumes this role at runtime so the container
    // can call DynamoDB without baking credentials into the image
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Allows the App Runner container to read/write DynamoDB',
    });

    table.grantReadWriteData(instanceRole);

    // Reference the existing ECR repo — you must create this and push your image
    // BEFORE running `cdk deploy AppRunnerStack`. See the README for the commands.
    const repo = ecr.Repository.fromRepositoryName(this, 'UrlShortenerRepo', 'url-shortener');

    // Auto-scaling config: always keep at least one instance running (minSize: 1),
    // scale up to 5, and allow up to 100 concurrent requests per instance
    const autoScaling = new apprunner.AutoScalingConfiguration(this, 'AutoScaling', {
      minSize: 1,
      maxSize: 5,
      maxConcurrency: 100,
    });

    // App Runner service: pulls the container from ECR, manages TLS, and auto-scales.
    // You get a public HTTPS URL with zero load balancer configuration.
    const service = new apprunner.Service(this, 'UrlShortenerService', {
      source: apprunner.Source.fromEcr({
        repository: repo,
        tagOrDigest: 'latest',
        imageConfiguration: {
          port: 3000,
          environmentVariables: { TABLE_NAME: table.tableName },
        },
      }),
      instanceRole,
      autoScalingConfiguration: autoScaling,
    });

    // App Runner provides a managed HTTPS URL — no certificate setup needed
    new cdk.CfnOutput(this, 'ServiceUrl', {
      value: `https://${service.serviceUrl}`,
      description: 'App Runner service URL',
    });
  }
}
