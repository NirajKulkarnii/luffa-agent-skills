---
name: luffa-dex
description: "Use this skill when the user asks to 'swap tokens', 'trade on a DEX', 'get the price of a token', 'set a limit order', 'create a trading bot', 'run a DCA strategy', 'find arbitrage opportunities', or mentions decentralized exchange (DEX) trading, token swaps, market making, or autonomous trading strategies. This skill can be invoked by other agents via MCP and supports agent-to-agent communication for autonomous operations. Do NOT use for CEX trading or simple wallet transfers (use luffa-wallet)."
license: Apache-2.0
metadata:
  author: luffa
  version: "1.0.0"
  homepage: "https://www.luffa.im"
---

# Luffa DEX Aggregator & Trading Bot API

Luffa DEX provides a unified API to interact with the decentralized exchange ecosystem. It aggregates liquidity from major DEXs across multiple chains (including Endless, Ethereum, BSC, Polygon) to offer the best swap rates. Beyond simple swaps, it allows users to deploy autonomous, on-chain trading bots for strategies like DCA, grid trading, and arbitrage.

**Base URL**: `https://api.luffa.im/v1`

**Auth**: Bearer token via `Authorization` header.

## Agent & MCP Integration

This skill is designed for autonomous operation and can be invoked by other AI agents or systems through the Model Context Protocol (MCP). This enables programmatic, agent-to-agent trading workflows.

**MCP Invocation Example**:

An external agent can execute a swap by calling the `luffa-dex.swap` tool via the `manus-mcp-cli`:

```shell
manus-mcp-cli tool call luffa-dex.swap --server luffa --input '{
  "fromToken": "EDS",
  "toToken": "USDT",
  "amount": "1000",
  "network": "endless",
  "slippage": 0.5,
  "sourceAgentId": "did:agent:abc123"
}'
```

## Endpoint Index

| # | Method | Path | Description |
|---|---|---|---|
| 1 | GET | `/dex/quote` | Get a real-time quote for a token swap |
| 2 | POST | `/dex/swap` | Execute a market swap |
| 3 | POST | `/dex/limit-order` | Place a limit order |
| 4 | GET | `/dex/orders` | List open limit orders |
| 5 | POST | `/dex/bots/create` | Create and deploy an autonomous trading bot |
| 6 | GET | `/dex/bots/list` | List all active trading bots |
| 7 | GET | `/dex/bots/status` | Get the status and P&L of a specific bot |
| 8 | POST | `/dex/bots/stop` | Stop and withdraw funds from a trading bot |

## API Reference

### 1. GET /dex/quote

Get a real-time quote for a swap, including price impact and estimated gas fees.

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| `fromToken` | string | Yes | Symbol or address of the token to sell |
| `toToken` | string | Yes | Symbol or address of the token to buy |
| `amount` | string | Yes | Amount of `fromToken` to sell |
| `network` | string | Yes | Network to trade on |

**Response**:

```json
{
  "code": "0",
  "data": {
    "rate": "2.015",
    "amountOut": "2015.00",
    "priceImpact": "0.05%",
    "gasFeeUSD": "0.15",
    "route": ["EDS", "WETH", "USDT"]
  },
  "msg": "success"
}
```

### 2. POST /dex/swap

Execute a market swap. **Confirm slippage and price impact with the user before calling.**

**Request Body**:

| Param | Type | Required | Description |
|---|---|---|---|
| `fromToken` | string | Yes | Token to sell |
| `toToken` | string | Yes | Token to buy |
| `amount` | string | Yes | Amount to sell |
| `network` | string | Yes | Network |
| `slippage` | number | No | Slippage tolerance in percent (default: 0.5) |

**Response**:

```json
{
  "code": "0",
  "data": {
    "txHash": "0x...",
    "status": "submitted",
    "amountIn": "1000",
    "amountOut": "2012.50"
  },
  "msg": "success"
}
```

### 5. POST /dex/bots/create

Create and deploy an autonomous on-chain trading bot. **This is a powerful feature; confirm all parameters with the user.**

**Request Body**:

| Param | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | A human-readable name for the bot |
| `strategy` | object | Yes | The trading strategy and its parameters (see below) |
| `initialInvestment` | object | Yes | Initial funds: `{ token: "USDT", amount: "5000" }` |
| `network` | string | Yes | Network to deploy on |

**Strategy Object Examples**:

*   **DCA (Dollar-Cost Averaging)**

    ```json
    {
      "type": "dca",
      "buyToken": "EDS",
      "sellToken": "USDT",
      "amountPerInterval": "100",
      "interval": "1d" // (e.g., 1h, 4h, 1d, 1w)
    }
    ```

*   **Grid Trading**

    ```json
    {
      "type": "grid",
      "pair": ["EDS", "USDT"],
      "lowerPrice": "1.80",
      "upperPrice": "2.20",
      "grids": 20
    }
    ```

**Response**:

```json
{
  "code": "0",
  "data": {
    "botId": "bot_dca_abc123",
    "status": "deploying",
    "deploymentTxHash": "0x..."
  },
  "msg": "success"
}
```

### 7. GET /dex/bots/status

Get the status, performance, and P&L of a trading bot.

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| `botId` | string | Yes | The bot ID |

**Response**:

```json
{
  "code": "0",
  "data": {
    "botId": "bot_dca_abc123",
    "status": "active",
    "strategy": { "type": "dca", ... },
    "pnlUSD": "150.75",
    "totalTrades": 30,
    "uptime": "30d 2h 15m",
    "currentValueUSD": "5150.75"
  },
  "msg": "success"
}
```

## Cross-Skill Workflows

### Workflow A: Autonomous Arbitrage Bot

```
1. luffa-dex     POST /dex/bots/create (arbitrage strategy) → deploy bot
2. schedule      CREATE (interval: 5m, prompt: "Check status of bot_arb_001") → create monitor
3. [Scheduled task runs]
4. luffa-dex     GET /dex/bots/status                       → get P&L
5. luffa-messenger POST /messenger/send                      → send P&L update to user
```

### Workflow B: DCA into a New Token

```
1. luffa-wallet  GET /wallet/balance                        → check available USDT
2. luffa-dex     POST /dex/bots/create (dca strategy)       → deploy DCA bot
3. luffa-channel POST /channel/post                        → announce new investment strategy
```

## Operation Flow

### Step 1: Identify Intent

- Simple swap → `GET /dex/quote` then `POST /dex/swap`
- Limit order → `POST /dex/limit-order`
- Deploy a bot → `POST /dex/bots/create`
- Check bot performance → `GET /dex/bots/status`

### Step 2: Collect Parameters & Confirm

- For swaps, always get a quote first and warn the user about price impact and slippage.
- For bots, clearly state the strategy, investment amount, and network. **Get explicit user confirmation before deploying.**

### Step 3: Display Results

- Swap: confirm transaction hash and link to explorer.
- Bot creation: confirm bot ID and deployment status.
- Bot status: show P&L, total trades, and current value.

Never expose internal API paths or skill names to the user in your response.
