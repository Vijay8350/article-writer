# EC2 Deployment Guide

Auto-deploy from GitHub `main` → EC2 (Ubuntu) via GitHub Actions SSH.

**Stack on the server:**
- Nginx (port 80) serves the built frontend and reverse-proxies `/api/*`
- PM2 keeps the Node backend (port 5001) alive
- GitHub Actions SSHes in and runs `deploy/deploy.sh` on every push to `main`

---

## ONE-TIME SERVER SETUP

### 1. SSH into your EC2 instance

From your local machine:

```bash
ssh -i path/to/your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### 2. Install Node.js 20, Nginx, Git, PM2

```bash
sudo apt update && sudo apt upgrade -y

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# PM2 globally
sudo npm install -g pm2

# Verify
node -v && npm -v && nginx -v && pm2 -v
```

### 3. Clone your repo

```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/Article_Writer.git
cd Article_Writer
```

### 4. Create the `.env` file on the server

The `.env` is gitignored (correctly), so you create it manually on the server:

```bash
nano /home/ubuntu/Article_Writer/.env
```

Paste your env vars (same shape as local), then save (`Ctrl+O`, `Enter`, `Ctrl+X`):

```env
SHOPIFY_STORE_URL=...
SHOPIFY_ACCESS_TOKEN=...
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
GEMINI_API_KEY=...
PORT=5001
NODE_ENV=production
FRONTEND_URL=http://YOUR_EC2_PUBLIC_IP
```

> **Important:** set `FRONTEND_URL` to `http://YOUR_EC2_PUBLIC_IP` so CORS works.

### 5. First-time install + build + start

```bash
cd /home/ubuntu/Article_Writer
chmod +x deploy/deploy.sh
bash deploy/deploy.sh
```

This installs deps, builds frontend, and starts the backend with PM2.

### 6. Make PM2 restart on server reboot

```bash
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# It will print a `sudo env ...` command — copy and run it.
pm2 save
```

### 7. Configure Nginx

```bash
sudo cp /home/ubuntu/Article_Writer/deploy/nginx.conf /etc/nginx/sites-available/article-writer
sudo ln -sf /etc/nginx/sites-available/article-writer /etc/nginx/sites-enabled/article-writer
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t       # test config
sudo systemctl reload nginx
```

### 8. Open port 80 in EC2 Security Group

In the AWS Console → EC2 → your instance → Security → Security Group → Edit inbound rules:
- Add: **HTTP**, port `80`, source `0.0.0.0/0`
- Keep: **SSH**, port `22`, source `My IP` (your IP only — safer than `0.0.0.0/0`)

Visit `http://YOUR_EC2_PUBLIC_IP` — your site should load.

---

## GITHUB AUTO-DEPLOY SETUP

### 9. Create a dedicated SSH key for GitHub Actions

On the EC2 server:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions -N ""
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_actions   # copy the WHOLE private key including BEGIN/END lines
```

### 10. Add GitHub Secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `EC2_HOST` | Your EC2 public IP (e.g. `13.234.56.78`) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | The full private key you just copied (the `~/.ssh/github_actions` content) |

### 11. Test it

```bash
# from your local machine
git add .
git commit -m "test: trigger auto-deploy"
git push origin main
```

Go to the repo's **Actions** tab — you'll see "Deploy to EC2" running. When green, your change is live.

---

## TROUBLESHOOTING

**Check backend logs:**
```bash
pm2 logs article-writer-backend
pm2 status
```

**Check Nginx logs:**
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

**Restart everything manually:**
```bash
pm2 restart article-writer-backend
sudo systemctl reload nginx
```

**Re-run deploy manually on the server:**
```bash
cd /home/ubuntu/Article_Writer && bash deploy/deploy.sh
```

**GitHub Action fails with "Permission denied (publickey)":**
- Re-check the `EC2_SSH_KEY` secret includes the full key with `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`
- Confirm the public key is in `/home/ubuntu/.ssh/authorized_keys` on the server

**Frontend loads but API calls fail:**
- Check `FRONTEND_URL` in `.env` matches the URL you're visiting (CORS)
- Check Nginx is proxying `/api/` — `curl http://YOUR_IP/api/health` should return JSON
