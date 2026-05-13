
import { Router } from "express";
import { createRegistryUpdate, submitRegistryTx } from "../controllers/registryController.js";

const router = Router();

// Step 1: Build unsigned registry update tx
router.post("/create", createRegistryUpdate);

// Step 2: Submit the signed registry tx
router.post("/submit", submitRegistryTx);

export default router;
