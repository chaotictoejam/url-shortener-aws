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
CloudWatch monitoring — from three inputs. The CDK stack handles DynamoDB
and IAM. The ECS Express Mode service deploys via AWS CLI.

### Step 1 — Deploy the CDK stack

```bash
cdk deploy EcsExpressStack
```

Note the `TaskRoleArn`, `ExecutionRoleArn`, and `TableName` outputs — you'll
need them in Step 3.

### Step 2 — Build and push the Docker image

```bash
cd ecs-express

# Get your account ID and region
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
ECR_URL=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com

aws ecr create-repository --repository-name url-shortener
aws ecr get-login-password | docker login --username AWS \
  --password-stdin 687611153613.dkr.ecr.us-east-1.amazonaws.com
docker build -t url-shortener .
docker tag url-shortener:latest 687611153613.dkr.ecr.us-east-1.amazonaws.com/url-shortener:latest
docker push $ECR_URL/url-shortener:latest
```

### Step 3 — Deploy the ECS Express Mode service

```bash
aws ecs create-express-service \
  --name url-shortener \
  --image $ECR_URL/url-shortener:latest \
  --port 3000 \
  --task-role <TaskRoleArn from CDK output> \
  --execution-role <ExecutionRoleArn from CDK output> \
  --environment TABLE_NAME=url-shortener,BASE_URL=<your-service-url> \
  --auto-scale-min 1 --auto-scale-max 5 \
  --health-check-path /health
```

### Test

```bash
SERVICE_URL=https://<your-ecs-express-domain>

curl -X POST $SERVICE_URL/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

curl -L $SERVICE_URL/V1StGXR

curl $SERVICE_URL/health
```

### Tear it down

```bash
cdk destroy EcsExpressStack
aws ecs delete-service --service url-shortener --force
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
