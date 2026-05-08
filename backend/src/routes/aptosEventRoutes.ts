

import { Router } from "express";
import {
  registerGem,
  logEvent,
  getGem,
  getGemHistoryHandler
} from "../controllers/aptosEventController";

const router = Router();

router.post("/gems", registerGem);
router.post("/events", logEvent);
router.get("/gems/:gemId", getGem);
router.get("/gems/:gemId/history", getGemHistoryHandler);

export default router;