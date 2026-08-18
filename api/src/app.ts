import { Hono } from "hono";
import { auth } from "./routes/auth";
import { accounts } from "./routes/accounts";
import { transfers } from "./routes/transfers";
import { transactions } from "./routes/transactions";
import { categories } from "./routes/categories";
import { tags } from "./routes/tags";
import { budgets } from "./routes/budgets";
import { jobs } from "./routes/jobs";

export const app = new Hono();

app.route("/api/auth", auth);
app.route("/api/accounts", accounts);
app.route("/api/transfers", transfers);
app.route("/api/transactions", transactions);
app.route("/api/categories", categories);
app.route("/api/tags", tags);
app.route("/api/budgets", budgets);
app.route("/api/jobs", jobs);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("[api]", err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

export default app;