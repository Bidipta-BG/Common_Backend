import { Router } from 'express';
import healthRouter from './health.routes';

// ─── Central route registry ───────────────────────────────────────────────────
// Register all resource routers here. New routes added in subsequent prompts
// should follow the pattern:
//   import xyzRouter from './xyz.routes';
//   router.use('/xyz', xyzRouter);

const router = Router();

router.use('/health', healthRouter);

// Future resource routes will be mounted here:
// router.use('/tenants', tenantsRouter);
// router.use('/games', gamesRouter);
// router.use('/tickets', ticketsRouter);
// router.use('/players', playersRouter);
// router.use('/draws', drawsRouter);
// router.use('/prizes', prizesRouter);

export default router;
