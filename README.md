# RFQ TEST

This testing suite benchmarks various decentralized messaging protocols.

## Setup

### Environment

First copy the `.env.example`

```bash
cd backend && cp .env.example .env
```

Then add the `TCP_MULTIADDRESS` of the remote node. Optionally you can also configure a `WS_MULTIADDRESS` of the node.

### Dependencies:

```bash
 npm install
```

## Start the Service

```bash
npm run start:dev
```

## WAKU

### Sending a Test Message

Send a GET request to:
http://localhost:3210/user/waku/send-request

### Local Node

If you'd like to run your own local node, follow this guide:
https://docs.waku.org/guides/nwaku/run-docker-compose

Then update the backend `.env` file according to your node multiaddresses.
