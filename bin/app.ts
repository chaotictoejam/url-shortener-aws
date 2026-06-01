#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LambdaStack } from '../lib/lambda-stack';
import { Ec2Stack } from '../lib/ec2-stack';
import { AppRunnerStack } from '../lib/app-runner-stack';

const app = new cdk.App();

// Read account and region from your local AWS CLI config.
// Run `aws configure` if these are undefined.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Approach 1: Fully serverless — Lambda + API Gateway. Pay per request, zero idle cost.
new LambdaStack(app, 'LambdaStack', { env });

// Approach 2: Traditional VM — EC2 + Express. Full control, always-on server.
new Ec2Stack(app, 'Ec2Stack', { env });

// Approach 3: Managed containers — App Runner. Containerized, auto-scaled, no infra to manage.
new AppRunnerStack(app, 'AppRunnerStack', { env });
