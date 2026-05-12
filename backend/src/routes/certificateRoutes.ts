
import { Router } from "express";
import { createCertificate, submitCertificate } from "../controllers/certificateController.js";

const router = Router();

// Step 1: Build unsigned tx (backend uses user address to select UTXOs)
router.post("/create", createCertificate);

// Step 2: Submit the signed tx (frontend sends back signed CBOR)
router.post("/submit", submitCertificate);

export default router;
