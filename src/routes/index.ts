import { Router } from 'express';
import * as walletController from '../controllers/walletController';

const router = Router();

// Transaction endpoints
router.post('/wallet/topup', walletController.topup);
router.post('/wallet/bonus', walletController.bonus);
router.post('/wallet/spend', walletController.spend);

// Query endpoints
router.get('/wallet/:userId/balance', walletController.getBalance);
router.get('/wallet/:userId/transactions', walletController.getTransactions);

// Reference data
router.get('/asset-types', walletController.getAssetTypes);
router.get('/users', walletController.getUsers);

export default router;
