import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson, isUniqueViolation } from "./helpers";
import { isoDate } from "../utils/format";
import { CALENDAR_TAX_DEADLINES } from "../constants";
import {
  activeAccountExists,
  categoryReferenceExists,
} from "../queries/references";
import {
  getCalendarEvents,
  getProjection,
  type DateWindow,
  duplicateCustomEvent,
  getCustomEvent,
  insertCustomEvent,
  softDeleteCustomEvent,
  updateCustomEvent,
} from "../queries/calendar";

const calendar = new Hono();

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Window for a month grid request. */
function monthWindow(month: number, year: number): DateWindow {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function validateMonthYear(c: import("hono").Context): { month: number; year: number } | null {
  const now = new Date();
  const month = Number(c.req.query("month") || now.getMonth() + 1);
  const year = Number(c.req.query("year") || now.getFullYear());
  if (
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(year) || year < 2000 || year > 2100
  ) {
    return null;
  }
  return { month, year };
}

/** Month grid â€” derived + custom events composed in ONE request. */
calendar.get("/events", requireAuth, async (c) => {
  const user = c.get("user");

  // Day-detail mode.
  const dateParam = c.req.query("date");
  if (dateParam) {
    if (!isValidDate(dateParam)) {
      return c.json({ error: "Invalid date." }, 400);
    }
    const events = await getCalendarEvents(
      user.user_id,
      { from: dateParam, to: dateParam }
    );
    let total_inflow = 0;
    let total_outflow = 0;
    for (const ev of events) {
      if (ev.kind === "inflow") total_inflow += ev.amount ?? 0;
      if (ev.kind === "outflow") total_outflow += ev.amount ?? 0;
    }
    return c.json({
      date: dateParam,
      events,
      total_inflow: Math.round(total_inflow * 100) / 100,
      total_outflow: Math.round(total_outflow * 100) / 100,
    });
  }

  const my = validateMonthYear(c);
  if (!my) return c.json({ error: "Invalid month or year." }, 400);
  const window = monthWindow(my.month, my.year);
  const events = await getCalendarEvents(user.user_id, window);

  // Day buckets with counts for the grid badges.
  const days: Record<string, number> = {};
  for (const ev of events) {
    days[ev.date] = (days[ev.date] ?? 0) + 1;
  }

  return c.json({
    month: my.month,
    year: my.year,
    events,
    day_counts: days,
  });
});

calendar.get("/upcoming", requireAuth, async (c) => {
  const user = c.get("user");
  const windowRaw = c.req.query("window") === "30" ? 30 : 7;
  const todayIso = isoDate(new Date());
  const horizonIso = isoDate(new Date(Date.now() + windowRaw * 86_400_000));

  const events = await getCalendarEvents(user.user_id, {
    from: todayIso,
    to: horizonIso,
  });

  // Group by day with per-day totals + a combined net figure.
  const byDay = new Map<
    string,
    { inflow: number; outflow: number; events: typeof events }
  >();
  let net = 0;
  for (const ev of events) {
    if (!byDay.has(ev.date)) {
      byDay.set(ev.date, { inflow: 0, outflow: 0, events: [] });
    }
    const bucket = byDay.get(ev.date)!;
    bucket.events.push(ev);
    if (ev.kind === "inflow") {
      bucket.inflow += ev.amount ?? 0;
      net += ev.amount ?? 0;
    } else if (ev.kind === "outflow") {
      bucket.outflow += ev.amount ?? 0;
      net -= ev.amount ?? 0;
    }
  }

  return c.json({
    window_days: windowRaw,
    net_cashflow: Math.round(net * 100) / 100,
    days: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({
        date,
        inflow_total: Math.round(b.inflow * 100) / 100,
        outflow_total: Math.round(b.outflow * 100) / 100,
        events: b.events,
      })),
  });
});

calendar.get("/cashflow-projection", requireAuth, async (c) => {
  const user = c.get("user");
  const horizonRaw = c.req.query("window") === "7" ? 7 : 30;
  return c.json({
    projections: await getProjection(user.user_id, horizonRaw),
  });
});

calendar.get("/tax-deadlines", requireAuth, async (c) => {
  const user = c.get("user");
  const now = new Date();
  const year = Number(c.req.query("year") || now.getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return c.json({ error: "Invalid year." }, 400);
  }

  const deadlines = CALENDAR_TAX_DEADLINES.map((deadline) => {
    const date = `${year}-${deadline.date}`;
    return {
      date,
      label: deadline.label,
      description: deadline.description,
      past: date < isoDate(now),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  void user;
  return c.json({ year, deadlines });
});

// ---- custom event CRUD ----

function validateEventBody(body: Record<string, unknown>, partial: boolean) {
  const fieldErrors: Record<string, string> = {};
  const title =
    body.title === undefined ? undefined : String(body.title).trim();
  const eventDate =
    body.event_date === undefined ? undefined : String(body.event_date ?? "").trim();
  const endDate =
    body.end_date === undefined ? undefined : String(body.end_date ?? "") || null;
  const eventType =
    body.event_type === undefined ? undefined : String(body.event_type ?? "");
  const amount =
    body.amount === undefined ? undefined : parseAmount(body.amount != null ? String(body.amount) : null);
  const accountId =
    body.account_id === undefined ? undefined : String(body.account_id ?? "") || null;
  const color = body.color === undefined ? undefined : String(body.color ?? "").trim() || null;
  const notes = body.notes === undefined ? undefined : String(body.notes ?? "").trim() || null;

  if (!partial || title !== undefined) {
    if (!title || title.length > 200) {
      fieldErrors.title = "Please enter a title (up to 200 characters).";
    }
  }
  if (!partial || eventDate !== undefined) {
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      fieldErrors.event_date = "Choose a valid event date.";
    }
  }
  if (endDate !== undefined && endDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    fieldErrors.end_date = "Choose a valid end date.";
  }
  if (
    !partial || eventType !== undefined
      ? eventType !== undefined && !["reminder", "income", "expense", "other"].includes(eventType)
      : false
  ) {
    fieldErrors.event_type = "Type must be reminder, income, expense or other.";
  }
  if (amount !== undefined && amount !== null && amount <= 0) {
    fieldErrors.amount = "Amounts must be greater than zero.";
  }

  return {
    fieldErrors,
    values: {
      title: title ?? null,
      eventDate: eventDate ?? null,
      endDate: endDate ?? null,
      eventType: eventType === "" ? null : eventType ?? null,
      amount: amount === undefined ? null : amount,
      accountId: accountId ?? null,
      color: color ?? null,
      notes: notes ?? null,
    },
  };
}

calendar.post("/events", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const check = validateEventBody(body as Record<string, unknown>, false);

  if (Object.keys(check.fieldErrors).length > 0 || !check.values.title || !check.values.eventDate) {
    return c.json(
      { fieldErrors: check.fieldErrors ?? { title: "Title and date are required." } },
      400
    );
  }
  const v = check.values;
  const confirmedTitle = v.title as string;
  const confirmedDate = v.eventDate as string;

  try {
    const id = await withUser(user.user_id, async (client) => {
      if (
        v.accountId &&
        !(await activeAccountExists(v.accountId, user.user_id, client))
      ) {
        throw new Error("INVALID_ACCOUNT");
      }
      return insertCustomEvent(client, {
        userId: user.user_id,
        title: confirmedTitle as string,
        eventDate: confirmedDate as string,
        endDate: v.endDate,
        eventType: v.eventType,
        amount: v.amount,
        accountId: v.accountId,
        color: v.color,
        notes: v.notes,
      });});
    return c.json({ success: true, event: { id } });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }
    console.error("[api] create calendar event failed:", err);
    return c.json(
      { error: "Could not save the event. Please try again." },
      500
    );
  }
});

function uuidOk(v: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(v);
}

calendar.get("/events/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const event = await getCustomEvent(user.user_id, c.req.param("id"));
  if (!event) return c.json({ error: "Not found" }, 404);
  return c.json({ event });
});

calendar.patch("/events/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidOk(id)) return c.json({ error: "Not found" }, 404);
  const body = await readJson(c);
  const check = validateEventBody(body as Record<string, unknown>, true);
  if (Object.keys(check.fieldErrors).length > 0) {
    return c.json({ fieldErrors: check.fieldErrors }, 400);
  }
  const v = check.values;
  const version = Number(body.version ?? 1);

  const result = await withUser(user.user_id, (client) =>
    updateCustomEvent(client, {
      userId: user.user_id,
      id,
      title: v.title,
      endDate: v.endDate,
      eventType: v.eventType,
      amountProvided: v.amount !== undefined,
      amount: v.amount === undefined ? null : v.amount,
      color: v.color,
      notes: v.notes,
      version,
    })
  );
  if (result.rowCount !== 1) {
    return c.json(
      { error: "This event was modified elsewhere. Refresh and try again." },
      409
    );
  }
  return c.json({ success: true });
});

calendar.delete("/events/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidOk(id)) return c.json({ error: "Not found" }, 404);
  const result = await withUser(user.user_id, (client) =>
    softDeleteCustomEvent(client, user.user_id, id)
  );
  if (result.rowCount !== 1) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

calendar.post("/events/:id/duplicate", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidOk(id)) return c.json({ error: "Not found" }, 404);

  try {
    const newId = await withUser(user.user_id, (client) =>
      duplicateCustomEvent(client, user.user_id, id)
    );
    if (newId === null) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true, event: { id: newId } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: "Duplicate event already exists." }, 409);
    }
    console.error("[api] duplicate calendar event failed:", err);
    return c.json(
      { error: "Could not duplicate the event. Please try again." },
      500
    );
  }
});

/** Explicit-month variant of the grid (same composer). */
calendar.get("/month/:month/:year", requireAuth, async (c) => {
  const month = Number(c.req.param("month"));
  const year = Number(c.req.param("year"));
  if (
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(year) || year < 2000 || year > 2100
  ) {
    return c.json({ error: "Invalid month or year." }, 400);
  }
  const user = c.get("user");
  const events = await getCalendarEvents(user.user_id, monthWindow(month, year));
  const days: Record<string, number> = {};
  for (const ev of events) {
    days[ev.date] = (days[ev.date] ?? 0) + 1;
  }
  return c.json({ month, year, events, day_counts: days });
});

export { calendar };
