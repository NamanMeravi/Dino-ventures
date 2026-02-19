export interface TopupRequest {
  userId: string;
  assetTypeId: string;
  amount: number;
  idempotencyKey: string;
  description?: string;
}

export interface BonusRequest {
  userId: string;
  assetTypeId: string;
  amount: number;
  idempotencyKey: string;
  description?: string;
}

export interface SpendRequest {
  userId: string;
  assetTypeId: string;
  amount: number;
  idempotencyKey: string;
  description?: string;
}

export interface BalanceResponse {
  userId: string;
  assetTypeId: string;
  assetName: string;
  assetSymbol: string;
  balance: string;
}

export interface TransactionResponse {
  id: string;
  type: string;
  status: string;
  amount: string;
  description: string | null;
  createdAt: Date;
}
