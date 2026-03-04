/**
 * Luffa DEX SDK Module
 * Corresponds to the luffa-dex skill
 *
 * Provides programmatic access to Luffa's DEX aggregator and
 * autonomous trading bot engine. Supports MCP and agent-to-agent invocation.
 */

import { LuffaClient, luffa } from './client.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SwapQuote {
  rate: string;
  amountOut: string;
  priceImpact: string;
  gasFeeUSD: string;
  route: string[];
}

export interface SwapResult {
  txHash: string;
  status: 'submitted' | 'confirmed' | 'failed';
  amountIn: string;
  amountOut: string;
}

export interface LimitOrder {
  orderId: string;
  fromToken: string;
  toToken: string;
  amount: string;
  targetPrice: string;
  network: string;
  status: 'open' | 'filled' | 'cancelled';
  createdAt: string;
}

// ─── Strategy Types ───────────────────────────────────────────────────────────

export type BotStrategyType = 'dca' | 'grid' | 'twap' | 'arbitrage';

export interface DCAStrategy {
  type: 'dca';
  buyToken: string;
  sellToken: string;
  amountPerInterval: string;
  interval: '1h' | '4h' | '1d' | '1w';
}

export interface GridStrategy {
  type: 'grid';
  pair: [string, string];
  lowerPrice: string;
  upperPrice: string;
  grids: number;
}

export interface TWAPStrategy {
  type: 'twap';
  fromToken: string;
  toToken: string;
  totalAmount: string;
  duration: string;
  intervals: number;
}

export interface ArbitrageStrategy {
  type: 'arbitrage';
  tokenA: string;
  tokenB: string;
  minProfitUSD: string;
  maxTradeUSD: string;
}

export type BotStrategy = DCAStrategy | GridStrategy | TWAPStrategy | ArbitrageStrategy;

export interface TradingBot {
  botId: string;
  name: string;
  status: 'deploying' | 'active' | 'paused' | 'stopped';
  strategy: BotStrategy;
  network: string;
  pnlUSD: string;
  totalTrades: number;
  currentValueUSD: string;
  uptime: string;
}

export interface CreateBotRequest {
  name: string;
  strategy: BotStrategy;
  initialInvestment: { token: string; amount: string };
  network: string;
}

// ─── DEX API ─────────────────────────────────────────────────────────────────

export class DexAPI {
  constructor(private client: LuffaClient = luffa) {}

  /** Get a real-time swap quote */
  async getQuote(
    fromToken: string,
    toToken: string,
    amount: string,
    network: string,
  ): Promise<SwapQuote> {
    const params = new URLSearchParams({ fromToken, toToken, amount, network });
    const res = await this.client.get<SwapQuote>(`/dex/quote?${params}`);
    return res.data;
  }

  /**
   * Execute a market swap.
   * IMPORTANT: Always confirm slippage and price impact with the user first.
   */
  async swap(
    fromToken: string,
    toToken: string,
    amount: string,
    network: string,
    slippage = 0.5,
  ): Promise<SwapResult> {
    const res = await this.client.post<SwapResult>('/dex/swap', {
      fromToken,
      toToken,
      amount,
      network,
      slippage,
    });
    return res.data;
  }

  /** Place a limit order */
  async placeLimitOrder(
    fromToken: string,
    toToken: string,
    amount: string,
    targetPrice: string,
    network: string,
  ): Promise<{ orderId: string; status: string }> {
    const res = await this.client.post<{ orderId: string; status: string }>(
      '/dex/limit-order',
      { fromToken, toToken, amount, targetPrice, network },
    );
    return res.data;
  }

  /** List open limit orders */
  async getOrders(network?: string): Promise<LimitOrder[]> {
    const params = network ? `?network=${network}` : '';
    const res = await this.client.get<LimitOrder[]>(`/dex/orders${params}`);
    return res.data;
  }

  /**
   * Create and deploy an autonomous trading bot.
   * IMPORTANT: Always confirm all parameters with the user before calling.
   */
  async createBot(request: CreateBotRequest): Promise<{ botId: string; status: string; deploymentTxHash: string }> {
    const res = await this.client.post<{ botId: string; status: string; deploymentTxHash: string }>(
      '/dex/bots/create',
      request,
    );
    return res.data;
  }

  /** List all trading bots */
  async listBots(): Promise<TradingBot[]> {
    const res = await this.client.get<TradingBot[]>('/dex/bots/list');
    return res.data;
  }

  /** Get the status and P&L of a specific bot */
  async getBotStatus(botId: string): Promise<TradingBot> {
    const res = await this.client.get<TradingBot>(`/dex/bots/status?botId=${botId}`);
    return res.data;
  }

  /**
   * Stop a trading bot and withdraw remaining funds.
   * IMPORTANT: Confirm with the user before stopping.
   */
  async stopBot(botId: string): Promise<{ txHash: string; withdrawnAmount: string; withdrawnToken: string }> {
    const res = await this.client.post<{ txHash: string; withdrawnAmount: string; withdrawnToken: string }>(
      '/dex/bots/stop',
      { botId },
    );
    return res.data;
  }
}

export const dexAPI = new DexAPI();
