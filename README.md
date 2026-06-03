# URL Shortener — 3 Ways on AWS (CDK)

Companion repo for the YouTube tutorial **"I Built the Same App 3 Ways on AWS."**
[▶ Watch on YouTube](https://www.youtube.com/@DrJoanneSkiles) <!-- update with final video link -->

The same URL shortener (POST to shorten, GET to redirect) deployed three different ways using AWS CDK:

| Approach | Service | Best for |
|---|---|---|
| 1 | Lambda + API Gateway | Zero idle cost, pay-per-request |
| 2 | EC2 + Express | Full server control, familiar model |
| 3 | ECS Express Mode | Containers without the ops overhead |

---

## Prerequisites

- **Node.js 20+** — `node --version`
- **AWS CLI configured** — `aws configure` (or set `AWS_PROFILE`)
- **AWS CDK bootstrapped** — run once per account/region: `cdk bootstrap`
- **Docker** — needed for the ECS Express Mode approach

---

## Project structure

```
url-shortener-aws/
├── lambda/          # Approach 1 — Lambda handler (shorten, redirect, health)
├── ec2/             # Approach 2 — Express app for an EC2 instance
├── ecs-express/     # Approach 3 — Same Express app + Dockerfile for ECS Express Mode
├── lib/             # CDK stacks (one per approach)
├── bin/app.ts       # CDK entry point — instantiates all three stacks
├── cdk.json         # CDK config
└── package.json     # Root CDK project dependencies
```

---

## Getting started

```bash
git clone https://github.com/chaotictoejam/AWSTutorials
cd url-shortener-aws
npm install
```

---

## Approach 1: Lambda + API Gateway

**How it works:** Three Lambda functions handle the three routes. API Gateway routes
incoming HTTP requests to the right function. There are no servers to manage and you
pay only for requests — the cost is effectively zero at tutorial traffic levels.

### Deploy

```bash
cdk deploy LambdaStack
```

CDK will print the API Gateway URL when the deploy finishes — it looks like
`https://abc123.execute-api.us-east-1.amazonaws.com/prod/`.

### Test

```bash
# Replace $API_URL with the output from cdk deploy
API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod

# Shorten a URL
curl -X POST $API_URL/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
# → {"shortCode":"V1StGXR"}

# Use the short code (follow the redirect)
curl -L $API_URL/V1StGXR

# Health check
curl $API_URL/health
# → {"status":"ok"}
```

---

## Approach 2: EC2 + Express

**How it works:** A `t3.micro` EC2 instance runs the Express app directly on
Amazon Linux 2023. The instance bootstraps itself on first boot via user data:
it installs Node, clones this repo, and starts the app with pm2.

### Before deploying

Update the `git clone` URL in [lib/ec2-stack.ts](lib/ec2-stack.ts) to point at your fork:

```typescript
'git clone https://github.com/YOUR_USERNAME/YOUR_REPO /app',
```

### Deploy

```bash
cdk deploy Ec2Stack
```

The deploy outputs the instance's public IP. Allow about **2 minutes** after the
deploy completes for the user data script to finish running.

### Test

```bash
# Replace $IP with the output from cdk deploy
IP=1.2.3.4

curl -X POST http://$IP:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

curl -L http://$IP:3000/V1StGXR

curl http://$IP:3000/health
```

---

## Approach 3: ECS Express Mode

> AWS App Runner no longer accepts new customers as of April 30, 2026.
> This project uses Amazon ECS Express Mode, AWS's recommended replacement.

**How it works:** ECS Express Mode provisions a Fargate-based ECS service
with an Application Load Balancer, HTTPS via ACM, auto-scaling, and
CloudWatch monitoring automatically. The CDK stack handles everything —
DynamoDB, IAM roles, and the Express Gateway service itself.

### Step 1 — Deploy with CDK

`cdk deploy` builds the Docker image locally and pushes it to ECR automatically —
no manual `docker build` or `docker push` needed. Requires Docker running locally.

```bash
cdk deploy EcsExpressStack
```

Note the `ServiceEndpoint` output — that's your ALB URL.

### Step 2 — Wire BASE_URL (second deploy)

`BASE_URL` is the service's own endpoint, which CloudFormation only knows after the first
deploy. Set it and redeploy to complete wiring:

**macOS/Linux**
```bash
SERVICE_URL=$(aws cloudformation describe-stacks --stack-name EcsExpressStack \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" \
  --output text)

cdk deploy EcsExpressStack --context baseUrl=$SERVICE_URL
```

**Windows (PowerShell)**
```powershell
$SERVICE_URL = aws cloudformation describe-stacks --stack-name EcsExpressStack `
  --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" `
  --output text

cdk deploy EcsExpressStack --context baseUrl=$SERVICE_URL
```

### Test

**macOS/Linux**
```bash
SERVICE_URL=$(aws cloudformation describe-stacks --stack-name EcsExpressStack \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" \
  --output text)

curl -X POST $SERVICE_URL/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

curl -L $SERVICE_URL/V1StGXR
curl $SERVICE_URL/health
```

**Windows (PowerShell)**
```powershell
$SERVICE_URL = aws cloudformation describe-stacks --stack-name EcsExpressStack `
  --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" `
  --output text

Invoke-RestMethod -Method Post -Uri "$SERVICE_URL/shorten" `
  -ContentType "application/json" `
  -Body '{"url": "https://example.com"}'

# Follow redirect
Invoke-WebRequest -Uri "$SERVICE_URL/V1StGXR" -MaximumRedirection 5

Invoke-RestMethod "$SERVICE_URL/health"
```

### Tear it down

```bash
cdk destroy EcsExpressStack
```

---

## ⚠️ Deploying multiple stacks to the same region

Each stack creates a DynamoDB table named `url-shortener`. AWS table names are unique
per account/region, so deploying all three stacks to the same region will fail on the
second deploy. Options:

- **Deploy one at a time** — destroy the previous stack before deploying the next
- **Use different regions** — e.g., `--context region=us-west-2`
- **Rename the tables** — change `tableName` in each stack to e.g. `url-shortener-lambda`

---

## Tearing it down

```bash
# Destroy a single stack
cdk destroy LambdaStack

# Destroy all three at once
cdk destroy --all
```

DynamoDB tables are set to `DESTROY` removal policy so they are deleted automatically.

---

## Questions?

Open an issue or find me on YouTube: [Dr. Joanne Skiles](https://www.youtube.com/@DrJoanneSkiles) <!-- update with channel link -->
