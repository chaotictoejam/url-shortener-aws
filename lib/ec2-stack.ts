import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class Ec2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Same DynamoDB table as the other stacks — all three approaches share the same schema
    const table = new dynamodb.Table(this, 'UrlTable', {
      tableName: 'url-shortener',
      partitionKey: { name: 'shortCode', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Use the default VPC — avoids the cost and complexity of creating a new one
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { isDefault: true });

    // IAM role: the EC2 instance assumes this to call DynamoDB without hard-coded credentials
    const role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Allows the URL shortener EC2 instance to read/write DynamoDB',
    });

    // Grant full table access to the role — the instance can read AND write
    table.grantReadWriteData(role);

    // Security group: open port 3000 for the app and port 22 so you can SSH in to debug
    const sg = new ec2.SecurityGroup(this, 'UrlShortenerSg', {
      vpc,
      description: 'Allow inbound on 3000 (app) and 22 (SSH)',
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000), 'App traffic');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH access');

    // User data: runs once on first boot to install Node, clone the repo, and start the app.
    // IMPORTANT: Update the git clone URL to your fork before deploying.
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      // Install Node.js, npm, and git via the Amazon Linux 2023 package manager
      'dnf install -y nodejs npm git',
      // Clone the tutorial repo — update this URL to your own fork
      'git clone https://github.com/chaotictoejam/AWSTutorials /app',
      // Install dependencies for the EC2 app
      'cd /app/ec2 && npm install',
      // pm2 is a process manager that keeps the app running and restarts it on crash
      'npm install -g pm2',
      // Start the app with TABLE_NAME pointing at our DynamoDB table
      'cd /app/ec2 && TABLE_NAME=url-shortener pm2 start app.js --name url-shortener',
      // Configure pm2 to restart the app automatically if the instance reboots
      'pm2 startup && pm2 save',
    );

    // t3.micro is free-tier eligible and plenty of capacity for this tutorial
    const instance = new ec2.Instance(this, 'UrlShortenerInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sg,
      role, // CDK automatically creates the IAM instance profile from this role
      userData,
    });

    // Print the public IP after deploy — the app will be at http://<IP>:3000
    new cdk.CfnOutput(this, 'InstancePublicIp', {
      value: instance.instancePublicIp,
      description: 'EC2 public IP — app runs at http://<IP>:3000 (allow ~2 min for user data to finish)',
    });
  }
}
