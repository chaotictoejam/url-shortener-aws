import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class LambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table — stores shortCode → originalUrl mappings.
    // PAY_PER_REQUEST means no capacity planning; you pay only for what you use.
    // DESTROY removal policy is fine for tutorials; change to RETAIN in production.
    const table = new dynamodb.Table(this, 'UrlTable', {
      tableName: 'url-shortener',
      partitionKey: { name: 'shortCode', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const sharedEnv = { TABLE_NAME: table.tableName };

    // NodejsFunction uses esbuild to bundle handler.js and its dependencies
    // into a single ZIP file — no manual npm install step needed.

    // Handles POST /shorten
    const shortenFn = new lambdaNode.NodejsFunction(this, 'ShortenFn', {
      entry: path.join(__dirname, '../lambda/handler.js'),
      handler: 'shorten',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: sharedEnv,
    });

    // Handles GET /:shortCode and issues the redirect
    const redirectFn = new lambdaNode.NodejsFunction(this, 'RedirectFn', {
      entry: path.join(__dirname, '../lambda/handler.js'),
      handler: 'redirect',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: sharedEnv,
    });

    // Handles GET /health
    const healthFn = new lambdaNode.NodejsFunction(this, 'HealthFn', {
      entry: path.join(__dirname, '../lambda/handler.js'),
      handler: 'health',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: sharedEnv,
    });

    // Least-privilege IAM: shorten writes, redirect only reads, health doesn't touch the table
    table.grantReadWriteData(shortenFn);
    table.grantReadData(redirectFn);

    // API Gateway REST API — this is the public HTTPS endpoint that invokes the Lambdas
    const api = new apigateway.RestApi(this, 'UrlShortenerApi', {
      restApiName: 'URL Shortener (Lambda)',
      description: 'Serverless URL shortener backed by Lambda and DynamoDB',
    });

    // POST /shorten
    const shortenResource = api.root.addResource('shorten');
    shortenResource.addMethod('POST', new apigateway.LambdaIntegration(shortenFn));

    // GET /health — defined before /{shortCode} so it doesn't get swallowed by the wildcard
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.LambdaIntegration(healthFn));

    // GET /{shortCode} — the wildcard redirect route
    const shortCodeResource = api.root.addResource('{shortCode}');
    shortCodeResource.addMethod('GET', new apigateway.LambdaIntegration(redirectFn));

    // Print the deployed URL after `cdk deploy` so you can test immediately
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL — paste this into your curl test commands',
    });
  }
}
