# VPS auto-deploy (GitHub Actions)

After each successful **Publish Release** workflow, **Deploy VPS** SSHs to the server and runs `vps-update.sh` (Docker API + website bundle).

## One-time server setup (aaPanel Terminal, root)

Add the deploy public key (same key as USB `S4-SERVER-BACKUP/keys/github_deploy.pub`):

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
grep -q 'AAAAC3NzaC1lZDI1NTE5AAAAIFRFxXTqkRhsjy4jtlnoLUuC1iuOdawkQUdq6lgPP5ar' /root/.ssh/authorized_keys || echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFRFxXTqkRhsjy4jtlnoLUuC1iuOdawkQUdq6lgPP5ar admin@DESKTOP-JUSJ7FT' >> /root/.ssh/authorized_keys
```

Test from your PC:

```powershell
ssh -i S:\S4-WORKSPACE\S4-SERVER-BACKUP\keys\github_deploy root@104.223.14.202 "echo ok"
```

## GitHub repository secrets

| Secret | Example |
|--------|---------|
| `VPS_HOST` | `104.223.14.202` |
| `VPS_SSH_USER` | `root` |
| `VPS_SSH_PRIVATE_KEY` | contents of `github_deploy` (private, no passphrase) |
| `VPS_SSH_PORT` | optional, default `22` |

Set from PC (repo admin, `gh` logged in as `s4businessthinking-cmyk`):

```powershell
cd s4-business-thinking-app
.\scripts\setup-github-vps-secrets.ps1
```

Or manually: GitHub → repo → Settings → Secrets and variables → Actions.

## Manual run

Actions → **Deploy VPS** → Run workflow.

If secrets are missing, the job exits successfully with a skip message (release is not blocked).
