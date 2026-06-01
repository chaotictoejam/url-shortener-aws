'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { nanoid } = require('nanoid');

// Initialize once at module scope — Lambda reuses the execution environment on warm starts,
// so this avoids paying the connection-setup cost on every invocation.
const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

/**
 * POST /shorten
 * Accepts { url } in the request body, generates a short code, stores the mapping,
 * and returns { shortCode }.
 */
const shorten = async (event) => {
  const { url } = JSON.parse(event.body);

  // nanoid(7) generates a 7-character URL-safe random string like "V1StGXR"
  const shortCode = nanoid(7);

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
    body: JSON.stringify({ shortCode }),
  };
};

/**
 * GET /{shortCode}
 * Looks up the short code in DynamoDB and issues a 301 redirect to the original URL.
 * Returns 404 if the code doesn't exist.
 */
const redirect = async (event) => {
  const { shortCode } = event.pathParameters;

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
    headers: { Location: result.Item.originalUrl },
    body: '',
  };
};

/**
 * GET /health
 * Simple liveness check — lets you verify the function is deployed and responsive.
 */
const health = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok' }),
  };
};

module.exports = { shorten, redirect, health };
