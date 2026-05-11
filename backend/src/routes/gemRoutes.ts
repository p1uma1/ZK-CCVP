
import { Router } from "express";
import { registerGem } from "../controllers/gemController";

const router = Router();

router.post("/register", registerGem);

export default router;
