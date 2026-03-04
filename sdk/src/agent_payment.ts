/**
 * Luffa Agent Payments SDK — TOTP Protected
 * Corresponds to the luffa-agent-payments skill
 */
import { LuffaClient, luffa } from './client.js';



export type PaymentScope =
  | 'service_fee'
  | 'swap'
  | 'trade'
  | 'onramp'
  | 'offramp'
  | 'airdrop';

export type PaymentRejectionReason =
  | 'TOTP_INVALID'
  | 'TOTP_EXPIRED'
  | 'TOTP_ALREADY_USED'
  | 'CHALLENGE_MISMATCH'
  | 'LIMIT_EXCEEDED'
  | 'SCOPE_VIOLATION'
  | 'SESSION_EXPIRED';


export interface TotpSetupRequest {
  userAddress: string;
  label?: string;
}

export interface TotpSetupResponse {
  totpSecret: string;
  qrCodeUrl: string;
  /** Shown only once — user must store these securely */
  backupCodes: string[];
  setupExpiresAt: string;
}

export interface TotpStatusResponse {
  totpEnabled: boolean;
  enrolledAt: string | null;
  lastUsedAt: string | null;
  backupCodesRemaining: number;
}


export interface AuthorizeRequest {
  agentId: string;
  userAddress: string;
  spendingLimitAmount: string;
  spendingLimitSymbol: string;
  perTransactionLimit: string;
  network: string;
  expiresAt: string;
  scope: PaymentScope[];
  /** Always set to true — every payment requires its own TOTP code */
  requireTotpPerTransaction: true;
  description: string;
}

export interface AuthorizeResponse {
  authorizationId: string;
  status: 'active';
  spendingLimitAmount: string;
  perTransactionLimit: string;
  spendingLimitSymbol: string;
  requireTotpPerTransaction: true;
  scope: PaymentScope[];
  expiresAt: string;
}

export interface AuthorizationStatus {
  authorized: boolean;
  authorizationId: string;
  spendingLimitAmount: string;
  perTransactionLimit: string;
  spendingLimitSymbol: string;
  amountSpent: string;
  amountRemaining: string;
  requireTotpPerTransaction: boolean;
  scope: PaymentScope[];
  expiresAt: string;
  network: string;
}


export interface TotpChallengeRequest {
  authorizationId: string;
  agentId: string;
  to: string;
  amount: string;
  symbol: string;
  paymentType: PaymentScope;
  memo?: string;
}

export interface TotpChallengeResponse {
  challengeToken: string;
  /** Token valid for 30 seconds only */
  expiresAt: string;
  expiresInSeconds: number;
  transactionSummary: {
    to: string;
    amount: string;
    symbol: string;
    paymentType: PaymentScope;
    memo: string | null;
  };
  pushNotificationSent: boolean;
}


export interface PayRequest {
  authorizationId: string;
  agentId: string;
  /**
   * From POST /agent/totp/challenge.
   * Must not be reused — request a new challenge for every payment.
   */
  challengeToken: string;
  /**
   * 6-digit code from the user's authenticator app.
   * The agent passes this through — never generates or validates it locally.
   */
  totpCode: string;
  /** Must exactly match the amount in the challenge */
  to: string;
  amount: string;
  symbol: string;
  network: string;
  paymentType: PaymentScope;
  memo?: string;
}

export interface PayResponse {
  txHash: string;
  status: 'confirmed' | 'pending' | 'failed';
  amount: string;
  symbol: string;
  amountSpent: string;
  amountRemaining: string;
  authorizationId: string;
  totpVerified: true;
}


export interface AgentTransaction {
  txHash: string;
  amount: string;
  symbol: string;
  to: string;
  paymentType: PaymentScope;
  memo: string | null;
  timestamp: string;
  status: 'confirmed' | 'pending' | 'failed';
  totpVerified: boolean;
  challengeToken: string;
}

export interface TransactionsResponse {
  transactions: AgentTransaction[];
  total: number;
  amountSpent: string;
  amountRemaining: string;
}


export interface RevokeRequest {
  authorizationId: string;
  revokedBy: 'user' | 'agent';
  /**
   * Required when revokedBy === 'user'.
   * Prevents a compromised agent from revoking its own session.
   */
  totpCode?: string;
  reason?: string;
}

export interface RevokeResponse {
  authorizationId: string;
  status: 'revoked';
  revokedAt: string;
  revokedBy: 'user' | 'agent';
}

export interface ExtendRequest {
  authorizationId: string;
  newSpendingLimit?: string;
  newExpiresAt?: string;
  /** Always required — cannot reuse codes from current session */
  totpCode: string;
}


export class AgentPaymentsAPI {
  constructor(private client: LuffaClient = luffa) {}


  /**
   * One-time enrollment. Returns a QR code URL for the user to scan
   * into Google Authenticator / Authy. Must be called before any payments.
   * Backup codes are shown only once — user must store them immediately.
   */
  async setupTotp(request: TotpSetupRequest): Promise<TotpSetupResponse> {
    const res = await this.client.post<TotpSetupResponse>('/agent/totp/setup', request);
    return res.data;
  }

  /**
   * Check whether TOTP is enrolled for this user.
   * Always call this first — if totpEnabled is false, run setupTotp() before
   * proceeding to authorize().
   */
  async getTotpStatus(userAddress: string): Promise<TotpStatusResponse> {
    const params = new URLSearchParams({ userAddress });
    const res = await this.client.get<TotpStatusResponse>(`/agent/totp/status?${params}`);
    return res.data;
  }


  /**
   * Step 1 — Create an agent payment session.
   * Sets spending rules and scope. Does not trigger TOTP — that happens
   * per payment via requestChallenge() + pay().
   */
  async authorize(request: AuthorizeRequest): Promise<AuthorizeResponse> {
    const res = await this.client.post<AuthorizeResponse>('/agent/authorize', request);
    return res.data;
  }

  /**
   * Step 2 — Check the current state of an active session.
   * Call before requestChallenge() to verify limits are not exhausted.
   */
  async getAuthorizationStatus(
    agentId: string,
    userAddress: string,
  ): Promise<AuthorizationStatus> {
    const params = new URLSearchParams({ agentId, userAddress });
    const res = await this.client.get<AuthorizationStatus>(
      `/agent/authorization-status?${params}`,
    );
    return res.data;
  }


  /**
   * Step 3 — Request a TOTP challenge for a specific transaction.
   * The server sends a push notification to the user's device.
   * Present the returned transactionSummary to the user alongside the
   * TOTP input prompt. challengeToken expires in 30 seconds.
   *
   * Never reuse a challengeToken — request a new one for every payment.
   */
  async requestChallenge(request: TotpChallengeRequest): Promise<TotpChallengeResponse> {
    const res = await this.client.post<TotpChallengeResponse>(
      '/agent/totp/challenge',
      request,
    );
    return res.data;
  }

  /**
   * Step 4 — Submit payment with TOTP verification.
   *
   * ⚠️ SECURITY CONTRACT:
   * - challengeToken  must come from requestChallenge() for THIS transaction
   * - totpCode        must come from the USER's authenticator app
   * - amount + to     must exactly match the original challenge
   * - The agent passes totpCode through — it never validates it locally
   * - Server independently verifies everything before executing
   *
   * Failure handling:
   * - TOTP_INVALID      → retry once with fresh code
   * - TOTP_EXPIRED      → call requestChallenge() again
   * - CHALLENGE_MISMATCH → block immediately, alert user, do not retry
   * - 3x failures       → call revoke() and alert user
   */
  async pay(request: PayRequest): Promise<PayResponse> {
    const res = await this.client.post<PayResponse>('/agent/pay', request);
    return res.data;
  }

  
  /**
   * Retrieve full transaction log for a session.
   * Each transaction includes totpVerified status for auditing.
   */
  async getTransactions(
    authorizationId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<TransactionsResponse> {
    const params = new URLSearchParams({ authorizationId });
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    const res = await this.client.get<TransactionsResponse>(
      `/agent/transactions?${params}`,
    );
    return res.data;
  }

  /**
   * Immediately terminate the agent session.
   *
   * If revokedBy === 'user', totpCode is required to prevent a compromised
   * agent from revoking its own session to hide unauthorized activity.
   *
   * Always call getTransactions() after revoke to show the user a full
   * spend summary.
   */
  async revoke(request: RevokeRequest): Promise<RevokeResponse> {
    if (request.revokedBy === 'user' && !request.totpCode) {
      throw new Error('totpCode is required for user-initiated revocation');
    }
    const res = await this.client.post<RevokeResponse>('/agent/revoke', request);
    return res.data;
  }

  /**
   * Request extension of spending limit or expiry.
   * Always requires a fresh TOTP code — codes from the current session
   * cannot be reused for extension approval.
   */
  async extend(request: ExtendRequest): Promise<AuthorizeResponse> {
    const res = await this.client.post<AuthorizeResponse>('/agent/extend', request);
    return res.data;
  }
}

export const agentPaymentsAPI = new AgentPaymentsAPI();