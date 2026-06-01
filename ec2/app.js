'use strict';

const express = require('express');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { nanoid } = require('nanoid');

const app = express();
app.use(express.json()); // Parse JSON request bodies automatically

// Initialize DynamoDB once at startup — same reasoning as the Lambda version
const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

// GET /health — liveness check; useful for load balancers and "is it running?" debugging
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// POST /shorten — generate a short code and store the URL mapping
app.post('/shorten', async (req, res) => {
  try {
    const { url } = req.body;
    const shortCode = nanoid(7); // 7-character URL-safe random string

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

// GET /:shortCode — look up the code and redirect to the original URL
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

    // 301 = permanent redirect — the browser caches this
    res.redirect(301, result.Item.originalUrl);
  } catch (err) {
    console.error('redirect error:', err);
    res.status(500).json({ error: 'Redirect failed' });
  }
});

// Start listening — port 3000 is the convention used across all three approaches
app.listen(3000, () => {
  console.log(`URL shortener listening on port 3000 (TABLE_NAME=${TABLE_NAME})`);
});

module.exports = app; // Exported for testing
