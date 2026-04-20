import cors from "cors";
import express from "express";

// `@clerk/express` is installed at the workspace level; mount `clerkMiddleware()` on
// protected route groups when provider APIs are implemented (keep `/health` public).

const app = express();

const webOrigin = process.env.WEB_APP_URL ?? "http://localhost:3000";

app.use(
  cors({
    origin: webOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" as const });
});

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
