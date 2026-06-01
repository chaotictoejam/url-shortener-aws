'use strict';
// This file is identical to ec2/app.js.
// The difference between Approach 2 (EC2) and Approach 3 (App Runner) is not the
// application code — it's how AWS runs it: a VM vs. a managed container platform.
// All comments and explanations are in ec2/app.js; this copy exists so the
// Dockerfile has a self-contained build context.

const express = require('express');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { nanoid } = require('nanoid');

const app = express();
app.use(express.json());

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/shorten', async (req, res) => {
  try {
    const { url } = req.body;
    const shortCode = nanoid(7);

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        shortCode,
        originalUrl: url,
        createdAt: new Date().toISOString(),
      },
    }));

    res.json({ shortCode });
  } catch (err) {
    console.error('shorten error:', err);
    res.status(500).json({ error: 'Failed to shorten URL' });
  }
});

app.get('/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { shortCode },
    }));

    if (!result.Item) {
      return res.status(404).json({ error: 'Short code not found' });
    }

    res.redirect(301, result.Item.originalUrl);
  } catch (err) {
    console.error('redirect error:', err);
    res.status(500).json({ error: 'Redirect failed' });
  }
});

app.listen(3000, () => {
  console.log(`URL shortener listening on port 3000 (TABLE_NAME=${TABLE_NAME})`);
});

module.exports = app;
