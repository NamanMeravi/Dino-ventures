import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as walletService from '../services/walletService';

const TopupSchema = z.object({
  userId: z.string().uuid(),
  assetTypeId: z.string().uuid(),
  amount: z.number().positive(),
  idempotencyKey: z.string().min(1).max(255),
  description: z.string().optional(),
});

const BonusSchema = TopupSchema;
const SpendSchema = TopupSchema;

const BalanceQuerySchema = z.object({
  assetTypeId: z.string().uuid(),
});

export async function topup(req: Request, res: Response, next: NextFunction) {
  try {
    const body = TopupSchema.parse(req.body);
    const result = await walletService.topupWallet(body);
    res.status(result.idempotent ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function bonus(req: Request, res: Response, next: NextFunction) {
  try {
    const body = BonusSchema.parse(req.body);
    const result = await walletService.issueBonus(body);
    res.status(result.idempotent ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function spend(req: Request, res: Response, next: NextFunction) {
  try {
    const body = SpendSchema.parse(req.body);
    const result = await walletService.spendCredits(body);
    res.status(result.idempotent ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    const { assetTypeId } = BalanceQuerySchema.parse(req.query);
    const result = await walletService.getBalance(userId, assetTypeId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    const { assetTypeId } = req.query;
    const result = await walletService.getTransactionHistory(userId, assetTypeId as string | undefined);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getAssetTypes(_req: Request, res: Response, next: NextFunction) {
  try {
    const { prisma } = await import('../services/walletService');
    const assets = await prisma.assetType.findMany();
    res.json({ success: true, data: assets });
  } catch (err) {
    next(err);
  }
}

export async function getUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const { prisma } = await import('../services/walletService');
    const users = await prisma.user.findMany({ where: { isSystem: false } });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}
