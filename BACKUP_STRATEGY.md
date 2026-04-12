# Firestore Backup & Recovery

## Overview
SimplyIdle stores all player save data, leaderboard entries, guild data, and social features in Google Cloud Firestore. This document outlines the backup strategy and recovery procedures.

## Backup Schedule

### Automated Exports (Recommended)
Set up scheduled Firestore exports via Google Cloud Scheduler + Cloud Functions:

```bash
# Enable Firestore export API
gcloud services enable firestore.googleapis.com

# Create a Cloud Storage bucket for backups
gsutil mb -l us-central1 gs://simplyidle-backups

# Schedule daily export at 03:00 UTC
gcloud scheduler jobs create http firestore-daily-backup \
  --schedule="0 3 * * *" \
  --uri="https://firestore.googleapis.com/v1/projects/simplyidle-43c81/databases/(default)/exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email=simplyidle-43c81@appspot.gserviceaccount.com \
  --headers="Content-Type=application/json" \
  --message-body='{"outputUriPrefix":"gs://simplyidle-backups/daily"}'
```

### Manual Export (Emergency)
```bash
gcloud firestore export gs://simplyidle-backups/manual/$(date +%Y%m%d-%H%M%S)
```

### Retention Policy
| Backup Type | Frequency | Retention |
|-------------|-----------|-----------|
| Daily       | Every 24h | 30 days   |
| Weekly      | Sundays   | 90 days   |
| Pre-deploy  | Before releases | 7 days |

## Collections to Back Up
- `online_saves` — Player save data (most critical)
- `leaderboard_global_v1` — Leaderboard entries
- `guilds` — Guild metadata and membership
- `guild_chat` — Guild chat messages
- `chat_global` — Global chat messages
- `friends` — Friend lists and requests
- `public_profiles` — Player display profiles
- `presence` — Online status (ephemeral, low priority)
- `cloud_mail` — In-game mail messages

## Recovery Procedure

### Full Restore
```bash
gcloud firestore import gs://simplyidle-backups/daily/YYYY-MM-DDTHH:MM:SS
```

### Single Document Restore
For individual player recovery, use the admin console `/devLoadSlot` command or restore from a specific export:
```bash
# List available backups
gsutil ls gs://simplyidle-backups/daily/

# Import specific collection
gcloud firestore import gs://simplyidle-backups/daily/LATEST \
  --collection-ids=online_saves
```

## Monitoring
- Set up Cloud Monitoring alerts for failed backup jobs
- Check backup bucket size weekly to verify exports are running
- Test restore procedure quarterly with a staging project

## Cost Estimate
- Firestore export: Billed per document read (~$0.06/100K docs)
- Cloud Storage: ~$0.02/GB/month for backup storage
- For a game with <10K players, expect <$5/month for daily backups
