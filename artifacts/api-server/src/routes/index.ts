import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import domainsRouter from "./domains";
import controlsRouter from "./controls";
import evidenceRouter from "./evidence";
import tasksRouter from "./tasks";
import poamsRouter from "./poams";
import dashboardRouter from "./dashboard";
import assessorRouter from "./assessor";
import auditRouter from "./auditlogs";
import documentsRouter from "./documents";
import organizationsRouter from "./organizations";
import evidenceRequestsRouter from "./evidence-requests";
import reviewLogsRouter from "./review-logs";
import csvImportsRouter from "./csv-imports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(organizationsRouter);
router.use(domainsRouter);
router.use(controlsRouter);
router.use(evidenceRouter);
router.use(evidenceRequestsRouter);
router.use(reviewLogsRouter);
router.use(csvImportsRouter);
router.use(tasksRouter);
router.use(poamsRouter);
router.use(dashboardRouter);
router.use(assessorRouter);
router.use(auditRouter);
router.use(documentsRouter);

export default router;
