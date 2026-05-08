

import { Router } from "express";
import {
  registerGem,
  logEvent,
  getGem,
} from "../controllers/aptosEventController";

const router = Router();

router.post("/gems", registerGem);
router.post("/events", logEvent);
router.get("/gems/:gemId", getGem);

export default router;