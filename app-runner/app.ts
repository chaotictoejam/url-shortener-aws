// Identical to ec2/app.ts — the application code is the same.
// The difference between Approach 2 (EC2) and Approach 3 (App Runner) is not the
// application code; it's how AWS runs it: a VM vs. a managed container platform.
// This copy exists so the Dockerfile has a self-contained build context.
import express, { Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { nanoid } from 'nanoid';

const app = express();
app.use(express.json());

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.post('/shorten', async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url: string };
    const shortCode = nanoid(7);
    const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        shortCode,
        originalUrl: url,
        createdAt: new Date().toISOString(),
      },
    }));

    res.json({ shortCode, shortUrl });
  } catch (err) {
    console.error('shorten error:', err);
    res.status(500).json({ error: 'Failed to shorten URL' });
  }
});

app.get('/:shortCode', async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params;

    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { shortCode },
    }));

    if (!result.Item) {
      res.status(404).json({ error: 'Short code not found' });
      return;
    }

    res.redirect(301, result.Item.originalUrl as string);
  } catch (err) {
    console.error('redirect error:', err);
    res.status(500).json({ error: 'Redirect failed' });
  }
});

app.listen(3000, () => {
  console.log(`URL shortener listening on port 3000 (TABLE_NAME=${TABLE_NAME})`);
});

export default app;
