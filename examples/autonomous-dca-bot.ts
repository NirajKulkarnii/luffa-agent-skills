/**
 * Example: Autonomous DCA Trading Bot
 *
 * This example demonstrates how to use the luffa-dex skill to deploy
 * an autonomous Dollar-Cost Averaging (DCA) bot on a DEX, monitor its
 * performance, and receive status updates via Luffa Messenger.
 *
 * Skills used: luffa-wallet → luffa-dex → luffa-messenger
 *
 * This pattern is also compatible with MCP agent-to-agent invocation.
 * An external orchestrator agent can call the luffa-dex.createBot tool
 * via manus-mcp-cli to deploy bots programmatically.
 */

const BASE_URL = 'https://api.luffa.im/v1';
const LUFFA_API_KEY = process.env.LUFFA_API_KEY ?? 'demo-key';

async function luffaFetch(method: string, path: string, body?: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-Luffa-API-Key': LUFFA_API_KEY,
      'Content-Type': 'application/json',
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  const json = await res.json();
  if (json.code !== '0') throw new Error(`Luffa API error: ${json.msg}`);
  return json.data;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  walletAddress: '0xYourWalletAddress',
  notifyHandle: '@yourLuffaHandle',
  bot: {
    name: 'EDS DCA Bot - March 2026',
    network: 'endless',
    initialInvestment: { token: 'USDT', amount: '1000' },
    strategy: {
      type: 'dca' as const,
      buyToken: 'EDS',
      sellToken: 'USDT',
      amountPerInterval: '100',
      interval: '1d' as const,
    },
  },
};

// ─── Main Workflow ────────────────────────────────────────────────────────────

async function deployDCABot() {
  console.log('=== Luffa Autonomous DCA Bot Deployment ===\n');

  // Step 1: Verify wallet balance (luffa-wallet)
  console.log('Step 1: Verifying wallet balance...');
  const balance = await luffaFetch('GET', `/wallet/balance?address=${CONFIG.walletAddress}`);
  const usdtBalance = balance.tokens.find((t: { symbol: string }) => t.symbol === 'USDT');
  const available = parseFloat(usdtBalance?.balance ?? '0');
  const required = parseFloat(CONFIG.bot.initialInvestment.amount);

  console.log(`  USDT balance: ${available}`);
  if (available < required) {
    throw new Error(`Insufficient USDT. Need ${required}, have ${available}.`);
  }
  console.log('  Balance sufficient ✓\n');

  // Step 2: Get a quick market quote to show current price (luffa-dex)
  console.log('Step 2: Getting current EDS/USDT rate...');
  const quote = await luffaFetch(
    'GET',
    `/dex/quote?fromToken=USDT&toToken=EDS&amount=100&network=${CONFIG.bot.network}`,
  );
  console.log(`  Current rate: 100 USDT → ${quote.amountOut} EDS`);
  console.log(`  Price impact: ${quote.priceImpact}\n`);

  // Step 3: Deploy the DCA bot (luffa-dex)
  // In production: present the config summary and await user confirmation
  console.log('Step 3: Deploying DCA bot...');
  console.log(`  Strategy: Buy ${CONFIG.bot.strategy.amountPerInterval} USDT of EDS every ${CONFIG.bot.strategy.interval}`);
  console.log(`  Initial investment: ${CONFIG.bot.initialInvestment.amount} ${CONFIG.bot.initialInvestment.token}`);
  console.log(`  Network: ${CONFIG.bot.network}`);

  const deployment = await luffaFetch('POST', '/dex/bots/create', CONFIG.bot);
  console.log(`  Bot deployed! ID: ${deployment.botId}`);
  console.log(`  Deployment tx: ${deployment.deploymentTxHash}\n`);

  // Step 4: Notify user via Luffa Messenger (luffa-messenger)
  console.log('Step 4: Sending deployment notification...');
  const message = `🤖 DCA Bot Deployed!\n\n` +
    `Bot: ${CONFIG.bot.name}\n` +
    `Strategy: Buy ${CONFIG.bot.strategy.amountPerInterval} USDT of EDS every ${CONFIG.bot.strategy.interval}\n` +
    `Initial investment: ${CONFIG.bot.initialInvestment.amount} USDT\n` +
    `Bot ID: ${deployment.botId}\n\n` +
    `I'll send you daily P&L updates.`;

  await luffaFetch('POST', '/messenger/send', {
    to: CONFIG.notifyHandle,
    content: message,
    type: 'text',
  });
  console.log('  Notification sent ✓\n');

  console.log('=== Bot Deployed Successfully ===');
  console.log(`Bot ID: ${deployment.botId}`);
  console.log('Use the luffa-dex skill to check status or stop the bot at any time.');

  return deployment.botId;
}

// ─── Status Monitor ───────────────────────────────────────────────────────────

/**
 * Monitor bot performance and send a daily update.
 * This function can be called by a scheduled agent or via MCP.
 *
 * MCP invocation example:
 *   manus-mcp-cli tool call luffa-dex.getBotStatus --server luffa \
 *     --input '{"botId": "bot_dca_abc123"}'
 */
async function sendDailyBotUpdate(botId: string, notifyHandle: string) {
  console.log(`\n=== Daily Bot Status Update: ${botId} ===`);

  const status = await luffaFetch('GET', `/dex/bots/status?botId=${botId}`);

  const pnlSign = parseFloat(status.pnlUSD) >= 0 ? '+' : '';
  const message = `📊 Daily DCA Bot Update\n\n` +
    `Bot: ${status.botId}\n` +
    `Status: ${status.status}\n` +
    `P&L: ${pnlSign}$${status.pnlUSD}\n` +
    `Total Trades: ${status.totalTrades}\n` +
    `Current Value: $${status.currentValueUSD}\n` +
    `Uptime: ${status.uptime}`;

  await luffaFetch('POST', '/messenger/send', {
    to: notifyHandle,
    content: message,
    type: 'text',
  });

  console.log(`P&L: $${status.pnlUSD} | Trades: ${status.totalTrades} | Value: $${status.currentValueUSD}`);
}

// ─── Grid Bot Example ─────────────────────────────────────────────────────────

async function deployGridBot() {
  console.log('\n=== Deploying Grid Trading Bot ===\n');

  const gridBot = await luffaFetch('POST', '/dex/bots/create', {
    name: 'EDS/USDT Grid Bot',
    network: 'endless',
    initialInvestment: { token: 'USDT', amount: '2000' },
    strategy: {
      type: 'grid',
      pair: ['EDS', 'USDT'],
      lowerPrice: '1.80',
      upperPrice: '2.20',
      grids: 20,
    },
  });

  console.log(`Grid bot deployed: ${gridBot.botId}`);
  return gridBot.botId;
}

// ─── MCP Agent-to-Agent Invocation Example ───────────────────────────────────

/**
 * This function demonstrates how an external agent can invoke luffa-dex
 * via MCP without direct API access. The orchestrator agent sends a
 * structured command, and the luffa-dex MCP server handles execution.
 *
 * Shell equivalent:
 *   manus-mcp-cli tool call luffa-dex.swap --server luffa --input '{
 *     "fromToken": "EDS",
 *     "toToken": "USDT",
 *     "amount": "500",
 *     "network": "endless",
 *     "slippage": 0.5,
 *     "sourceAgentId": "did:agent:orchestrator-001"
 *   }'
 */
function getMCPSwapCommand(fromToken: string, toToken: string, amount: string): string {
  return `manus-mcp-cli tool call luffa-dex.swap --server luffa --input '${JSON.stringify({
    fromToken,
    toToken,
    amount,
    network: 'endless',
    slippage: 0.5,
    sourceAgentId: 'did:agent:orchestrator-001',
  })}'`;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main() {
  // Deploy the DCA bot
  const botId = await deployDCABot();

  // Simulate a daily status check
  await sendDailyBotUpdate(botId, CONFIG.notifyHandle);

  // Show MCP invocation example
  console.log('\n=== MCP Agent-to-Agent Invocation Example ===');
  console.log('To swap 500 EDS to USDT from another agent, run:');
  console.log(getMCPSwapCommand('EDS', 'USDT', '500'));
}

main().catch(console.error);
