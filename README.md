# Xavion

Production-focused Discord moderation bot built with TypeScript, discord.js,
and MongoDB.

## Features

- Matching prefix and slash commands
- Moderation, warnings, channel controls, purge, and giveaways
- Automatic warning actions
- Persistent nickname channels
- Global developer-managed no-prefix users
- Components V2 help, ping, and mention greeting
- MongoDB persistence with unique indexes and connection pooling
- Structured logs and graceful shutdown

## Requirements

- Node.js 22.12 or newer
- MongoDB Atlas or MongoDB 7+
- Discord bot with Server Members and Message Content privileged intents

## Installation

```sh
npm ci
cp .env.example .env
npm run check
npm run build
npm run deploy:commands
npm start
```

Use `npm run dev` during development. It runs TypeScript directly and restarts
when source files change.

## MongoDB

Set `MONGODB_URI` to an Atlas or self-hosted connection string. Xavion creates
the required collections and indexes during startup. Persistent data includes:

- warnings and automatic warning actions
- giveaways and giveaway entries
- nickname channels
- global no-prefix users

No application data is stored in local files.

## Discord permissions

The generated invite uses permission integer `1374525156374`:

- View Channels
- Send Messages
- Send Messages in Threads
- Manage Messages
- Embed Links
- Read Message History
- Use External Emojis
- Manage Channels
- Manage Nicknames
- Kick Members
- Ban Members
- Moderate Members
- Connect

The bot role must also be placed above members it needs to moderate or rename.

## VPS deployment

Build once and run the compiled application under a process manager:

```sh
npm ci
npm run build
npm run deploy:commands
NODE_ENV=production npm start
```

Example PM2 command:

```sh
pm2 start dist/index.js --name xavion --node-args="--enable-source-maps"
pm2 save
```

Do not run `tsx watch` or nodemon in production.

## Docker

```sh
docker build -t xavion .
docker run --env-file .env --restart unless-stopped xavion
```
