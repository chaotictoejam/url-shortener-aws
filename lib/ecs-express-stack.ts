import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class EcsExpressStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Same table schema used across all three stacks — shortCode is the partition key
    const table = new dynamodb.Table(this, 'UrlTable', {
      tableName: 'url-shortener',
      partitionKey: { name: 'shortCode', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // no capacity planning required
      removalPolicy: cdk.RemovalPolicy.DESTROY, // auto-delete when the stack is destroyed
    });

    // Task role — the IAM identity the running container assumes.
    // This is what allows your app code to call DynamoDB.
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    table.grantReadWriteData(taskRole); // least-privilege: only this table, read + write

    // Execution role — used by ECS itself (not your app) to pull the image from ECR
    // and ship container logs to CloudWatch. The managed policy covers both.
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    // ECR repo reference — image must be pushed before running `cdk deploy`.
    // ECS Express Mode reads the image URI from the CLI command (Step 3 in the README);
    // this reference lets CDK verify the repo exists at synth time.
    const _repo = ecr.Repository.fromRepositoryName(
      this, 'Repo', 'url-shortener'
    );

    // Output the role ARNs and table name — you'll paste these into the
    // `aws ecs create-express-service` CLI command in Step 3.
    new cdk.CfnOutput(this, 'TaskRoleArn', {
      value: taskRole.roleArn,
      description: 'Pass to --task-role in the ECS Express Mode deploy command',
    });
    new cdk.CfnOutput(this, 'ExecutionRoleArn', {
      value: executionRole.roleArn,
      description: 'Pass to --execution-role in the ECS Express Mode deploy command',
    });
    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'Pass as TABLE_NAME in --environment',
    });
  }
}
