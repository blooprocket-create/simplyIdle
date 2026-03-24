# Leaderboard API Contract (Beta)

## Endpoint Summary
- `POST /v1/leaderboard/submit`
- `GET /v1/leaderboard/top?seasonId=<id>&limit=<n>`
- `GET /v1/leaderboard/me?seasonId=<id>&playerId=<id>`

## Submit Payload
```json
{
  "playerId": "string",
  "displayName": "string",
  "seasonId": "string",
  "highestWaveReached": 123,
  "seasonPoints": 4567,
  "prestigeCount": 8,
  "clientVersion": "1.0.0-beta.1",
  "sentAt": 1711300000000
}
```

## Server Validation Rules
- Reject negative values.
- Reject implausible jumps using previous snapshot deltas.
- Enforce rate limit: max 1 submit per 10 seconds per player.
- Validate season id is active.

## Response Shape
```json
{
  "ok": true,
  "seasonId": "s1",
  "rank": 42,
  "score": 9876,
  "updatedAt": 1711300001000
}
```

## Ranking Formula (Server)
- Primary: `seasonPoints`
- Tie-breaker #1: `highestWaveReached`
- Tie-breaker #2: `prestigeCount`
- Tie-breaker #3: earliest `updatedAt`
