# URL Shortener — 3 Ways on AWS (CDK)

Companion repo for the YouTube tutorial **"I Built the Same App 3 Ways on AWS."**
[▶ Watch on YouTube](https://www.youtube.com/@DrJoanneSkiles) <!-- update with final video link -->

The same URL shortener (POST to shorten, GET to redirect) deployed three different ways using AWS CDK:

| Approach | Service | Best for |
|---|---|---|
| 1 | Lambda + API Gateway | Zero idle cost, pay-per-request |
| 2 | EC2 + Express | Full server control, familiar model |
| 3 | App Runner | Containers without the ops overhead |

---

## Prerequisites

- **Node.js 20+** — `node --version`
- **AWS CLI configured** — `aws configure` (or set `AWS_PROFILE`)
- **AWS CDK bootstrapped** — run once per account/region: `cdk bootstrap`
- **Docker** — only needed for the App Runner approach

---

## Project structure

```
url-shortener-aws/
├── lambda/          # Approach 1 — Lambda handler (shorten, redirect, health)
├── ec2/             # Approach 2 — Express app for an EC2 instance
├── app-runner/      # Approach 3 — Same Express app + Dockerfile for App Runner
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

> **Note:** `@aws-cdk/aws-apprunner-alpha` must match your `aws-cdk-lib` version.
> If you see peer dependency errors, run:
> ```bash
> npm install aws-cdk-lib @aws-cdk/aws-apprunner-alpha@alpha --legacy-peer-deps
> ```

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

## Approach 3: App Runner

**How it works:** App Runner runs your Docker container and handles load balancing,
TLS certificates, and auto-scaling automatically. You push an image to ECR and
App Runner does the rest.

### Before deploying

**Step 1 — Create the ECR repository** (one-time):

```bash
aws ecr create-repository --repository-name url-shortener
```

**Step 2 — Build and push the image:**

```bash
# Get your account ID and region
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
ECR_URI=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/url-shortener

# Authenticate Docker with ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI

# Build and push
docker build -t url-shortener ./app-runner
docker tag url-shortener:latest $ECR_URI:latest
docker push $ECR_URI:latest
```

### Deploy

```bash
cdk deploy AppRunnerStack
```

### Test

```bash
# Replace $SERVICE_URL with the output from cdk deploy (it already includes https://)
SERVICE_URL=https://abc123.us-east-1.awsapprunner.com

curl -X POST $SERVICE_URL/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

curl -L $SERVICE_URL/V1StGXR

curl $SERVICE_URL/health
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
