import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { nanoid } from 'nanoid';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Initialize once at module scope — Lambda reuses the execution environment on warm starts,
// so this avoids paying the connection-setup cost on every invocation.
const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!; // set by the CDK stack

/**
 * POST /shorten
 * Accepts { url }, generates a short code, stores the mapping,
 * and returns { shortCode, shortUrl }.
 */
export const shorten = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { url } = JSON.parse(event.body!);

  // nanoid(7) generates a 7-character URL-safe random string like "V1StGXR"
  const shortCode = nanoid(7);

  // Build the full clickable URL the caller can share immediately
  const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      shortCode,
      originalUrl: url,
      createdAt: new Date().toISOString(),
    },
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shortCode, shortUrl }),
  };
};

/**
 * GET /{shortCode}
 * Looks up the short code in DynamoDB and issues a 301 redirect to the original URL.
 * Returns 404 if the code doesn't exist.
 */
export const redirect = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { shortCode } = event.pathParameters!;

  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { shortCode },
  }));

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Short code not found' }),
    };
  }

  // 301 = permanent redirect; browsers cache this so they won't hit Lambda again
  return {
    statusCode: 301,
    headers: { Location: result.Item.originalUrl as string },
    body: '',
  };
};

/**
 * GET /health
 * Simple liveness check — lets you verify the function is deployed and responsive.
 */
export const health = async (): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok' }),
  };
};
