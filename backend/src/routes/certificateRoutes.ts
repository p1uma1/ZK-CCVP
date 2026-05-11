
import { Router } from "express";
import { createCertificate } from "../controllers/certificateController.js";

const router = Router();

router.post("/create", createCertificate);

export default router;
