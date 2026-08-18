"""
MoneyMind - Mock / Seed Data Script
===================================

Populates the schema created by db_setup.py with realistic demo data:
3 users, system lookups, and 200+ rows per module, with cached-column
consistency (debts match their amortization schedules, account balances
match transactions, budget alerts match actual spend).

Run AFTER db_setup.py:

    scripts/.venv/Scripts/python scripts/mock_data.py

Connection config: identical env vars to db_setup.py
    DATABASE_URL / PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE
    (defaults: localhost / 5432 / postgres / postgres / moneymind_dev)

Works unchanged on Supabase: set DATABASE_URL to your pooler string.

Notes
-----
- Deterministic: fixed seed (20260813) -> reproducible data.
- One transaction; any failure rolls back the whole load.
- Runs as the table owner so RLS does not interfere.
- ~31k rows; multi-row inserts keep runtime under a minute.
"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import math
import os
import random
import re
import sys
import time
import uuid

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

# ---------------------------------------------------------------------------
# Config (same env contract as db_setup.py)
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
PGHOST = os.getenv("PGHOST", "localhost")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "postgres")
PGDATABASE = os.getenv("PGDATABASE", "moneymind_dev")

SEED = 20260813
TODAY = dt.date.today()
NOW = dt.datetime.now(dt.timezone.utc)
rng = random.Random(SEED)

rows_total: dict[str, int] = {}


def new_id() -> str:
    return str(uuid.uuid4())


def money(x: float) -> float:
    return round(x, 2)


def days_ago(n: int) -> dt.date:
    return TODAY - dt.timedelta(days=n)


def pick(pool):
    return rng.choice(pool)


def rand(a: float, b: float) -> float:
    return rng.uniform(a, b)


def clean_merchant(raw: str) -> str:
    cleaned = re.sub(
        r"\b(Pvt|Ltd|Private|Limited|Technologies|Technology|Tech|Solutions|Services|India|Group)\b",
        "", raw,
    )
    return re.sub(r"\s+", " ", cleaned).strip()


def conninfo(dbname: str) -> str:
    if DATABASE_URL:
        return DATABASE_URL
    return f"host={PGHOST} port={PGPORT} dbname={dbname} user={PGUSER} password={PGPASSWORD}"


def insert(conn, table: str, columns: list[str], rows: list[tuple]) -> int:
    if not rows:
        return 0
    cols = sql.SQL(", ").join(map(sql.Identifier, columns))
    ph = sql.SQL(", ").join(sql.Placeholder() * len(columns))
    stmt = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(sql.Identifier(table), cols, ph)
    with conn.cursor() as cur:
        cur.executemany(stmt, rows)
    rows_total[table] = rows_total.get(table, 0) + len(rows)
    return len(rows)


# ---------------------------------------------------------------------------
# Lookups (system data, shared by all users)
# ---------------------------------------------------------------------------

def lookup_rows(conn) -> dict[str, str]:
    """System lookups. Returns name -> category_id for all system categories."""
    account_types = [
        ("bank_savings", "Savings Account", "wallet", 1, 1),
        ("bank_current", "Current Account", "briefcase", 1, 2),
        ("credit_card", "Credit Card", "card", 0, 3),
        ("wallet", "E-Wallet", "phone", 1, 4),
        ("cash", "Cash", "note", 1, 5),
        ("fd", "Fixed Deposit", "lock", 1, 6),
        ("ppf", "PPF Account", "shield", 1, 7),
    ]
    debt_types = [
        ("home_loan", "Home Loan", 1, 1),
        ("car_loan", "Car Loan", 1, 2),
        ("personal_loan", "Personal Loan", 0, 3),
        ("education_loan", "Education Loan", 0, 4),
        ("credit_card", "Credit Card Dues", 0, 5),
        ("other", "Other", 0, 6),
    ]
    tax_sections = [
        ("80C", "Section 80C - ELSS, PPF, EPF, Life Insurance", "Deductions on 80C investments", 150000, "old", 1),
        ("80CCD-1B", "Section 80CCD(1B) - NPS Additional", "NPS extra deduction", 50000, "both", 2),
        ("80D", "Section 80D - Health Insurance", "Health insurance premiums", 100000, "both", 3),
        ("80DD", "Section 80DD - Disabled Dependent", "Medical of disabled dependent", 150000, "old", 4),
        ("80E", "Section 80E - Education Loan Interest", "Interest on education loans", 999999, "old", 5),
        ("80G", "Section 80G - Donations", "Donations to eligible funds", 50000, "old", 6),
        ("80TTA", "Section 80TTA - Savings Interest", "Interest up to 10000 exempt", 10000, "old", 7),
        ("24B", "Section 24(b) - Home Loan Interest", "Self-occupied property interest", 200000, "old", 8),
        ("HRA", "HRA Exemption", "House rent allowance exemption", 999999, "old", 9),
        ("LTA", "LTA Exemption", "Leave travel allowance", 999999, "old", 10),
        ("STD", "Standard Deduction", "Flat standard deduction", 50000, "both", 11),
    ]
    slabs = [
        ("FY-2025-26", "old", 0, 250000, 0.0, 0.04),
        ("FY-2025-26", "old", 250000, 500000, 0.05, 0.04),
        ("FY-2025-26", "old", 500000, 1000000, 0.20, 0.04),
        ("FY-2025-26", "old", 1000000, 999999999, 0.30, 0.04),
        ("FY-2025-26", "new", 0, 400000, 0.0, 0.04),
        ("FY-2025-26", "new", 400000, 800000, 0.05, 0.04),
        ("FY-2025-26", "new", 800000, 1200000, 0.10, 0.04),
        ("FY-2025-26", "new", 1200000, 1600000, 0.15, 0.04),
        ("FY-2025-26", "new", 1600000, 2000000, 0.20, 0.04),
        ("FY-2025-26", "new", 2000000, 2400000, 0.25, 0.04),
        ("FY-2025-26", "new", 2400000, 999999999, 0.30, 0.04),
    ]
    note_templates = [
        ("passport", "Passport", "Passport number and details",
         Jsonb({"fields": [{"key": "passport_no", "label": "Passport Number"}, {"key": "expiry", "label": "Expiry Date"}]}), "globe", 1),
        ("pan_card", "PAN Card", "PAN number",
         Jsonb({"fields": [{"key": "pan_no", "label": "PAN Number"}]}), "file", 2),
        ("aadhaar", "Aadhaar", "Aadhaar number",
         Jsonb({"fields": [{"key": "aadhaar_no", "label": "Aadhaar Number"}]}), "id", 3),
        ("driving_license", "Driving License", "Driving license details",
         Jsonb({"fields": [{"key": "license_no", "label": "License Number"}, {"key": "expiry", "label": "Expiry Date"}]}), "car", 4),
        ("vehicle_rc", "Vehicle RC", "Vehicle registration certificate",
         Jsonb({"fields": [{"key": "reg_no", "label": "Registration Number"}, {"key": "chassis_no", "label": "Chassis Number"}]}), "car", 5),
        ("health_insurance", "Health Insurance Policy", "Health policy details",
         Jsonb({"fields": [{"key": "policy_no", "label": "Policy Number"}, {"key": "expiry", "label": "Expiry Date"}, {"key": "sum_insured", "label": "Sum Insured"}]}), "heart", 6),
        ("vehicle_insurance", "Vehicle Insurance", "Vehicle policy details",
         Jsonb({"fields": [{"key": "policy_no", "label": "Policy Number"}, {"key": "expiry", "label": "Expiry Date"}]}), "car", 7),
        ("membership", "Membership Card", "Gym / club membership",
         Jsonb({"fields": [{"key": "member_id", "label": "Membership ID"}, {"key": "expiry", "label": "Expiry Date"}]}), "star", 8),
    ]

    cat_income = ["Salary", "Business Income", "Freelance Income", "Interest Income",
                  "Dividend Income", "Rental Income", "Other Income"]
    cat_expense_top = [
        ("Food & Dining", "Restaurants, cafes, delivery", "restaurant"),
        ("Groceries", "Supermarket and grocery stores", "cart"),
        ("Transport", "Auto, metro, cab fares", "bus"),
        ("Fuel", "Petrol and diesel", "fuel"),
        ("Housing", "Rent and maintenance", "home"),
        ("Utilities", "Electricity, water, internet, phone", "plug"),
        ("Healthcare", "Doctor, pharmacy, hospital", "plus"),
        ("Insurance", "Health, vehicle, life premiums", "shield"),
        ("Entertainment", "Movies, OTT, events", "tv"),
        ("Shopping", "Clothes, electronics, household", "bag"),
        ("Education", "Courses, books, school fees", "book"),
        ("Travel", "Flights, hotels, holidays", "plane"),
        ("Personal Care", "Salon, grooming, fitness", "scissors"),
        ("Subscriptions", "Streaming, apps, memberships", "repeat"),
        ("Gifts & Donations", "Gifts and charity", "gift"),
    ]
    cat_sub = {
        "Transport": ["Auto & Cab", "Public Transport", "Metro"],
        "Utilities": ["Electricity", "Water", "Internet", "Mobile Recharge"],
        "Entertainment": ["Movies", "OTT", "Concerts"],
        "Shopping": ["Clothing", "Electronics", "Home & Kitchen"],
        "Travel": ["Flights", "Hotels", "Holidays"],
        "Healthcare": ["Doctor Visit", "Pharmacy", "Lab Tests"],
    }

    cats: list[tuple] = []
    cat_ids: dict[str, str] = {}
    for i, name in enumerate(["Income"] + cat_income, start=1):
        cid = new_id()
        cat_ids[name] = cid
        cats.append((cid, None, None, name, 1, "gray", "tag", i, 1))
    for i, (name, _, icon) in enumerate(cat_expense_top, start=1):
        cid = new_id()
        cat_ids[name] = cid
        cats.append((cid, None, None, name, 1, "gray", icon, i + 10, 1))
    for parent, kids in cat_sub.items():
        for kid in kids:
            kid_id = new_id()
            cat_ids[kid] = kid_id
            cats.append((kid_id, None, cat_ids[parent], kid, 1, "gray", "sub", 0, 1))

    goal_templates = [
        (None, "Emergency Fund", "3-6 months of expenses", 300000, 12, "umbrella", 1, 1),
        (None, "Vacation", "Dream holiday fund", 150000, 12, "plane", 1, 1),
        (None, "New Phone", "Upgrade your phone", 80000, 6, "phone", 1, 1),
        (None, "Down Payment", "Home down payment", 1000000, 36, "home", 1, 1),
        (None, "Retirement Corpus", "Long term retirement goal", 5000000, 120, "sun", 1, 1),
        (None, "Wedding", "Wedding expenses fund", 500000, 24, "ring", 1, 1),
    ]
    report_templates = [
        (None, "Monthly Cash Flow", Jsonb({"chart": "bar", "x": "month", "y": "amount", "group_by": "type"}), "Income vs expense by month", 1),
        (None, "Category Breakdown", Jsonb({"chart": "pie", "group_by": "category"}), "Expense share by category", 1),
        (None, "Net Worth Trend", Jsonb({"chart": "line", "x": "date", "y": "net_worth"}), "Net worth over time", 1),
        (None, "Savings Rate", Jsonb({"chart": "line", "x": "month", "y": "pct"}), "Savings rate by month", 1),
        (None, "Budget Utilization", Jsonb({"chart": "gauge", "metric": "utilization"}), "Budget utilization per category", 1),
        (None, "Debt Paydown", Jsonb({"chart": "line", "x": "month", "y": "outstanding"}), "Debt outstanding over time", 1),
    ]

    insert(conn, "account_types", ["type_code", "display_name", "icon", "is_asset", "sort_order"], account_types)
    insert(conn, "debt_types", ["type_code", "display_name", "is_secured", "sort_order"], debt_types)
    insert(conn, "tax_sections", ["section_code", "name", "description", "max_limit", "applicable_regime", "sort_order"], tax_sections)
    insert(conn, "tax_regime_slabs", ["financial_year", "regime", "slab_from", "slab_to", "rate", "cess_rate"], slabs)
    insert(conn, "note_templates", ["template_code", "name", "description", "fields", "icon", "sort_order"], note_templates)
    insert(conn, "categories", ["id", "user_id", "parent_id", "name", "is_system", "color",
                                "icon", "sort_order", "version"], cats)
    insert(conn, "goal_templates", ["user_id", "name", "description", "default_target_amount", "default_timeframe_months", "icon", "is_system", "version"], goal_templates)
    insert(conn, "report_templates", ["user_id", "name", "chart_config", "description", "version"], report_templates)
    return cat_ids


# ---------------------------------------------------------------------------
# Module 0: Identity / Auth / Audit
# ---------------------------------------------------------------------------

def auth_rows(conn) -> list[int]:
    """Users, profiles, settings, tokens, audit/access/login logs."""
    emails = [
        ("demo@moneymind.local", "Demo User", "INR"),
        ("partner@moneymind.local", "Partner User", "INR"),
        ("family@moneymind.local", "Family User", "INR"),
    ]
    # Real bcrypt hash (cost 12) of "Demo1234" so the demo users can log in through the
    # app (Module 0 password policy: >= 8 chars, letter + digit). Same password for all
    # three demo users. Generated with bcryptjs; deterministic (fixed salt).
    DEMO_PASSWORD_HASH = "$2b$12$7YT12imyxKf66uEaQB4kNesLugwtSvh5vQvMXLDBOVg8CKpYeWmIi"
    user_ids: list[int] = []
    users_cols = ["email", "hashed_password", "role", "email_verified_at", "last_login_at",
                  "deleted_at", "deleted_by", "created_at", "updated_at", "version"]
    for i, (email, name, currency) in enumerate(emails, start=1):
        row = (email, DEMO_PASSWORD_HASH, "user",
               NOW - dt.timedelta(days=400), NOW - dt.timedelta(hours=rand(0, 72)), None, None,
               NOW - dt.timedelta(days=400), NOW - dt.timedelta(days=rand(0, 30)), 1)
        uid = conn.execute(
            sql.SQL("INSERT INTO users ({}) VALUES ({}) RETURNING user_id").format(
                sql.SQL(", ").join(map(sql.Identifier, users_cols)),
                sql.SQL(", ").join(sql.Placeholder() * len(users_cols))),
            row,
        ).fetchone()[0]
        user_ids.append(uid)

    profiles = [
        (uid, name, f"https://avatars.example/{name.lower().replace(' ', '')}.png",
         f"Mock user {i} for the MoneyMind demo", uid, uid,
         NOW - dt.timedelta(days=400), NOW - dt.timedelta(days=30))
        for i, (uid, (_, name, _)) in enumerate(zip(user_ids, emails), start=1)
    ]
    insert(conn, "user_profiles", ["user_id", "full_name", "avatar_url", "bio",
                                   "created_by", "updated_by", "created_at", "updated_at"], profiles)
    settings = [
        (uid, currency, pick(["light", "dark"]), 1, "en", None, 0,
         base64.b64encode(rng.randbytes(64)).decode(), uid, uid,
         NOW - dt.timedelta(days=400), NOW - dt.timedelta(days=30))
        for uid, (_, _, currency) in zip(user_ids, emails)
    ]
    insert(conn, "user_settings", ["user_id", "currency", "theme", "notifications_enabled", "language",
                                   "ai_api_key", "ai_enabled", "vault_recovery_wrapped",
                                   "created_by", "updated_by",
                                   "created_at", "updated_at"], settings)

    tokens = []
    for uid in user_ids:
        tokens.append((uid, hashlib.sha256(f"session-{uid}".encode()).hexdigest(), "session",
                       NOW + dt.timedelta(days=30), None, NOW - dt.timedelta(days=30)))
        tokens.append((uid, hashlib.sha256(f"reset-{uid}".encode()).hexdigest(), "password_reset",
                       NOW + dt.timedelta(days=1), NOW - dt.timedelta(days=10),
                       NOW - dt.timedelta(days=15)))
    insert(conn, "auth_tokens", ["user_id", "token_hash", "token_type", "expires_at",
                                 "revoked_at", "created_at"], tokens)

    audit_tables = ["accounts", "transactions", "budgets", "bills", "goals", "investments", "secure_notes"]
    audits = []
    for uid in user_ids:
        for _ in range(70):
            table = pick(audit_tables)
            action = pick(["INSERT", "INSERT", "UPDATE", "DELETE"])
            audits.append((uid, table, new_id(), action,
                           Jsonb({"before": "old"}) if action != "INSERT" else None,
                           Jsonb({"after": "new"}) if action != "DELETE" else None,
                           NOW - dt.timedelta(hours=rand(1, 24 * 60))))
    insert(conn, "audit_logs", ["user_id", "table_name", "record_id", "action",
                                "old_value", "new_value", "timestamp"], audits)

    access = []
    logins = []
    for i, uid in enumerate(user_ids):
        ips = [f"192.168.{rng.randint(0, 255)}.{rng.randint(1, 254)}",
               f"10.0.{rng.randint(0, 255)}.{rng.randint(1, 254)}"]
        for _ in range(70):
            access.append((uid, pick(ips), "Mozilla/5.0 (MoneyMind demo)",
                           pick(["login", "logout", "login", "login", "failed_login"]),
                           NOW - dt.timedelta(hours=rand(1, 24 * 60))))
        for _ in range(70):
            ok = rng.random() < 0.9
            logins.append((uid if ok else None, emails[i][0], pick(ips), 1 if ok else 0,
                           NOW - dt.timedelta(hours=rand(1, 24 * 60))))
    insert(conn, "access_logs", ["user_id", "ip_address", "user_agent", "action", "timestamp"], access)
    insert(conn, "login_attempts", ["user_id", "email_attempt", "ip_address", "success", "timestamp"], logins)
    return user_ids

# ---------------------------------------------------------------------------
# Module 1: Accounts & Wallets (+ balance history)
# ---------------------------------------------------------------------------

ACC_PROFILES = [
    ("bank_savings", "Savings Account", "HDFC", 1, 50000, None),
    ("bank_savings", "Savings Account", "SBI", 1, 20000, None),
    ("bank_savings", "Savings Account", "ICICI", 1, 15000, None),
    ("bank_current", "Current Account", "HDFC", 1, 80000, None),
    ("bank_current", "Current Account", "SBI", 1, 30000, None),
    ("credit_card", "Credit Card", "ICICI", 1, -30000, 250000),
    ("credit_card", "Credit Card", "HDFC", 1, -12000, 150000),
    ("credit_card", "Credit Card", "SBI", 1, -8000, 100000),
    ("wallet", "E-Wallet", "Paytm", 1, 2500, None),
    ("wallet", "E-Wallet", "PhonePe", 1, 1800, None),
    ("cash", "Cash", "Cash", 1, 5000, None),
    ("fd", "Fixed Deposit", "Axis", 1, 200000, None),
    ("fd", "Fixed Deposit", "HDFC", 1, 150000, None),
    ("ppf", "PPF Account", "Post Office", 1, 180000, None),
]


def m1_accounts(user_ids: list[int]) -> tuple[list[tuple], dict[str, tuple[int, str, float]]]:
    """210 accounts (70 per user) + opening balances. Returns (rows, acct_meta)."""
    per_user = 70
    rows: list[tuple] = []
    meta: dict[str, tuple[int, str, float]] = {}
    colors = ["#EF5350", "#AB47BC", "#5C6BC0", "#42A5F5", "#26A69A", "#9CCC65", "#FFA726", "#FF7043", "#8D6E63", "#78909C"]
    for uid in user_ids:
        for k in range(per_user):
            acct = new_id()
            acct_type, product, institution, is_active, opening, limit = pick(ACC_PROFILES)
            opening = money(opening * rand(0.6, 1.6)) if abs(opening) > 5000 else opening
            name = f"{institution} {product}" if k < len(ACC_PROFILES) else f"{institution} {product} {k // 2}"
            rows.append((acct, uid, name, acct_type, institution, opening, limit, "INR",
                         pick(colors), pick(["Primary", "Joint", "Minor", None]), is_active, k,
                         1, uid, uid, None, None, NOW - dt.timedelta(days=rand(30, 500)),
                         NOW - dt.timedelta(days=rand(0, 30))))
            meta[acct] = (uid, acct_type, opening)
    return rows, meta


def m1_balance_history(meta: dict[str, tuple[int, str, float]],
                       net_by: dict[tuple[str, dt.date], float]) -> list[tuple]:
    """Daily balances for the last 60 days per account = opening + cumulative net."""
    rows: list[tuple] = []
    start = days_ago(60)
    for acct, (uid, _, opening) in meta.items():
        running = opening
        for day in range(61):
            d = start + dt.timedelta(days=day)
            running += net_by.get((acct, d), 0.0)
            rows.append((uid, acct, money(running), d))
    return rows


# ---------------------------------------------------------------------------
# Module 2: Transaction Engine
# ---------------------------------------------------------------------------

MERCHANTS = {
    "Food & Dining": ["Swiggy", "Zomato", "Domino's", "McDonald's", "KFC", "Cafe Coffee Day",
                      "Sagar Ratna", "Punjabi Rasoi", "Third Wave Coffee", "Barbeque Nation"],
    "Groceries": ["BigBasket", "Dmart", "Blinkit", "Zepto", "Reliance Fresh", "More Supermarket",
                  "Spencer's", "Nature's Basket"],
    "Transport": ["Uber", "Ola", "Rapido", "Paytm Auto", "Meru Cabs"],
    "Fuel": ["Indian Oil", "HP Petrol", "Bharat Petroleum", "Shell", "Reliance Fuel"],
    "Housing": ["Rent Payment", "Society Maintenance", "Brokerage"],
    "Utilities": ["BESCOM", "BWSSB", "Airtel Broadband", "Jio Recharge", "Vi Recharge"],
    "Healthcare": ["Apollo Pharmacy", "MedPlus", "PharmEasy", "Fortis Hospital", "1mg"],
    "Insurance": ["LIC", "HDFC ERGO", "Star Health", "Bajaj Allianz", "ICICI Lombard"],
    "Entertainment": ["PVR Cinemas", "BookMyShow", "INOX", "Netflix", "Amazon Prime"],
    "Shopping": ["Amazon", "Flipkart", "Myntra", "Ajio", "Decathlon", "IKEA", "Croma", "Reliance Digital"],
    "Education": ["Udemy", "Coursera", "Amazon Books", "Crossword", "BYJU'S"],
    "Travel": ["IRCTC", "MakeMyTrip", "Cleartrip", "Air India", "IndiGo", "Airbnb", "Goibibo"],
    "Personal Care": ["Urban Company", "Lakme Salon", "Cult.fit", "Natural Salon", "Just Herbs"],
    "Subscriptions": ["Netflix", "Amazon Prime", "Hotstar", "Spotify", "YouTube Premium", "iCloud", "Google One"],
    "Gifts & Donations": ["GiveIndia", "Amazon Gift", "Flipkart Gift", "Temple Donation", "Local Charity"],
}

INCOME_MERCHANTS = {
    "Salary": ["Acme Corp Salary", "Acme Corp Bonus"],
    "Business Income": ["Client Invoice", "Shop Sales"],
    "Freelance Income": ["Upwork", "Fiverr"],
    "Interest Income": ["Bank Interest", "FD Maturity"],
    "Dividend Income": ["Dividend Payout"],
    "Rental Income": ["Rent Received"],
    "Other Income": ["Cashback", "Refund"],
}

AMOUNT_RANGE = {
    "Food & Dining": (150, 900), "Groceries": (300, 2500), "Transport": (60, 500),
    "Fuel": (500, 2000), "Housing": (1000, 18000), "Utilities": (300, 3000),
    "Healthcare": (200, 4000), "Insurance": (1000, 25000), "Entertainment": (100, 1200),
    "Shopping": (500, 8000), "Education": (300, 5000), "Travel": (2000, 25000),
    "Personal Care": (200, 1500), "Subscriptions": (99, 1500), "Gifts & Donations": (100, 3000),
}

SPEND_WEIGHTS = [10, 10, 6, 8, 6, 8, 4, 6, 5, 8, 3, 2, 4, 7, 3]


def m2_transactions(conn, user_ids: list[int], cat_ids: dict[str, str],
                    meta: dict[str, tuple[int, str, float]]) -> dict:
    """All Module 2 data. Returns net_by (for balance history) and spend maps (for budgets)."""
    gid1, gid2 = new_id(), new_id()
    shared_groups = [
        (gid1, user_ids[0], "Family Finance", "Shared expenses and goals for the family", 1, 1,
         user_ids[0], user_ids[0], None, None, NOW - dt.timedelta(days=365), NOW - dt.timedelta(days=5)),
        (gid2, user_ids[1], "Household", "Household shared budget", 1, 1,
         user_ids[1], user_ids[1], None, None, NOW - dt.timedelta(days=200), NOW - dt.timedelta(days=5)),
    ]
    insert(conn, "shared_groups", ["id", "owner_id", "name", "description", "is_active", "version",
                                   "created_by", "updated_by", "deleted_at", "deleted_by",
                                   "created_at", "updated_at"], shared_groups)
    group_ids = [gid1, gid2]
    group_members = [
        (group_ids[0], user_ids[0], "admin", "active", user_ids[0], 1, user_ids[0], user_ids[0],
         None, None, NOW - dt.timedelta(days=365), NOW - dt.timedelta(days=5)),
        (group_ids[0], user_ids[1], "read_only", "active", user_ids[0], 1, user_ids[0], user_ids[0],
         None, None, NOW - dt.timedelta(days=365), NOW - dt.timedelta(days=5)),
        (group_ids[0], user_ids[2], "read_only", "active", user_ids[0], 1, user_ids[0], user_ids[0],
         None, None, NOW - dt.timedelta(days=365), NOW - dt.timedelta(days=5)),
        (group_ids[1], user_ids[1], "admin", "active", user_ids[1], 1, user_ids[1], user_ids[1],
         None, None, NOW - dt.timedelta(days=200), NOW - dt.timedelta(days=5)),
        (group_ids[1], user_ids[0], "read_only", "active", user_ids[1], 1, user_ids[1], user_ids[1],
         None, None, NOW - dt.timedelta(days=200), NOW - dt.timedelta(days=5)),
    ]
    insert(conn, "group_members", ["group_id", "user_id", "role", "status", "invited_by", "version",
                                   "created_by", "updated_by", "deleted_at", "deleted_by",
                                   "created_at", "updated_at"], group_members)
    group_invites = []
    for i, (gid, owner) in enumerate([(group_ids[0], user_ids[0]), (group_ids[1], user_ids[1])]):
        for j in range(3):
            status = pick(["pending", "accepted", "declined", "revoked", "expired"])
            group_invites.append((gid, f"invite{j}@example.com",
                                  hashlib.sha256(f"gi-{i}-{j}".encode()).hexdigest(), status,
                                  owner, NOW + dt.timedelta(days=30 - j * 5),
                                  NOW - dt.timedelta(days=10) if status == "accepted" else None,
                                  user_ids[1] if status == "accepted" else None,
                                  NOW - dt.timedelta(days=20)))
    insert(conn, "group_invites", ["group_id", "invitee_email", "token_hash", "status", "invited_by",
                                   "expires_at", "accepted_at", "accepted_by", "created_at"], group_invites)

    tags = []
    tag_ids: dict[tuple[int, str], str] = {}
    tag_pool = ["work", "family", "tax", "health", "one-time", "recurring", "vacation", "gift",
                "home", "invest", "urgent", "optional"]
    for uid in user_ids:
        for name in tag_pool:
            tid = new_id()
            tag_ids[(uid, name)] = tid
            tags.append((tid, uid, name, pick(["#EF5350", "#42A5F5", "#66BB6A", "#FFA726"]), 1))
    insert(conn, "tags", ["id", "user_id", "name", "color", "version"], tags)

    batches = []
    batch_ids: dict[int, list[str]] = {uid: [] for uid in user_ids}
    for uid in user_ids:
        for k in range(4):
            bid = new_id()
            batch_ids[uid].append(bid)
            status = pick(["completed", "completed", "partial", "failed"])
            total = rng.randint(50, 400)
            batches.append((bid, uid, f"bank_statement_{TODAY.year - (0 if k else 1)}.csv", total,
                            int(total * rand(0.6, 1.0)), rng.randint(0, 10), rng.randint(0, 15),
                            status, days_ago(rng.randint(5, 90)), days_ago(rng.randint(0, 5)),
                            f"imports/{bid}.log", NOW - dt.timedelta(days=rng.randint(5, 90))))
    insert(conn, "import_batches", ["id", "user_id", "filename", "total_rows", "imported_rows",
                                    "duplicate_rows", "error_rows", "status", "date_from",
                                    "date_to", "error_log_path", "created_at"], batches)

    user_cats = ["Pet Care", "Gardening", "Kids School", "Home Gym", "Party Fund"]
    user_cat_ids: dict[tuple[int, str], str] = {}
    user_cat_rows = []
    for uid in user_ids:
        for name in user_cats:
            cid = new_id()
            user_cat_ids[(uid, name)] = cid
            user_cat_rows.append((cid, uid, None, name, 0, pick(["#7E57C2", "#26A69A"]),
                                  "custom", 50, 1))
    insert(conn, "categories", ["id", "user_id", "parent_id", "name", "is_system", "color",
                                "icon", "sort_order", "version"], user_cat_rows)

    txns: list[tuple] = []
    transfers: list[tuple] = []
    net_by: dict[tuple[str, dt.date], float] = {}
    spent_by: dict[tuple[int, str, int, int], float] = {}
    spent_overall: dict[tuple[int, int, int], float] = {}
    mappings: list[tuple] = []
    seen_mappings: dict[tuple[int, str], None] = {}
    tt_rows: list[tuple] = []
    splits_rows: list[tuple] = []
    split_count = 0

    savings = [a for a, (u, t, _) in meta.items() if t == "bank_savings"]
    wallets = [a for a, (u, t, _) in meta.items() if t in ("wallet", "cash")]
    ccs = [a for a, (u, t, _) in meta.items() if t == "credit_card"]
    fds = [a for a, (u, t, _) in meta.items() if t == "fd"]

    spans = {user_ids[0]: 18, user_ids[1]: 12, user_ids[2]: 12}
    salaries = {user_ids[0]: 85000, user_ids[1]: 55000, user_ids[2]: 0}
    business = {user_ids[2]: 40000}
    expense_plan = {user_ids[0]: (25, 45), user_ids[1]: (10, 18), user_ids[2]: (10, 16)}
    transfer_plan = {user_ids[0]: 80, user_ids[1]: 20, user_ids[2]: 20}

    for uid in user_ids:
        uid_savings = [a for a in savings if meta[a][0] == uid]
        uid_wallets = [a for a in wallets if meta[a][0] == uid]
        uid_ccs = [a for a in ccs if meta[a][0] == uid]
        uid_fds = [a for a in fds if meta[a][0] == uid]
        months = spans[uid]
        start_month = TODAY.replace(day=1) - dt.timedelta(days=months * 31)
        used_batches = batch_ids[uid]

        for m in range(months):
            month_start = start_month.replace(day=1) + dt.timedelta(days=m * 31)
            month_start = month_start.replace(day=1)
            month_len = (month_start.replace(month=month_start.month % 12 + 1, day=1) - dt.timedelta(days=1)).day if month_start.month == 12 else (dt.date(month_start.year, month_start.month + 1, 1) - dt.timedelta(days=1)).day
            y, mo = month_start.year, month_start.month

            if salaries[uid] and m >= 1:
                d = month_start + dt.timedelta(days=rng.randint(0, 2))
                tid = new_id()
                txns.append((tid, uid, pick(uid_savings), "income", salaries[uid], "Acme Corp Salary",
                             "Acme Corp", cat_ids["Salary"], d, None, None, None, None, 1,
                             "manual", 0, 1, uid, uid, dt.datetime.combine(d, dt.time(9, 0), tzinfo=dt.timezone.utc),
                             dt.datetime.combine(d, dt.time(9, 0), tzinfo=dt.timezone.utc)))
                net_by[(txns[-1][1], d)] = net_by.get((txns[-1][1], d), 0) + salaries[uid]

            if uid == user_ids[2] and m >= 1:
                d = month_start + dt.timedelta(days=rng.randint(3, 6))
                tid = new_id()
                txns.append((tid, uid, pick(uid_savings), "income", business[uid], "Shop Sales",
                             "Shop", cat_ids["Business Income"], d, None, None, None, None, 1,
                             "manual", 0, 1, uid, uid, dt.datetime.combine(d, dt.time(12, 0), tzinfo=dt.timezone.utc),
                             dt.datetime.combine(d, dt.time(12, 0), tzinfo=dt.timezone.utc)))
                net_by[(txns[-1][1], d)] = net_by.get((txns[-1][1], d), 0) + business[uid]

            if uid == user_ids[0] and m > 0 and m % 3 == 0:
                d = month_start + dt.timedelta(days=rng.randint(8, 12))
                amount = rand(8000, 30000)
                tid = new_id()
                txns.append((tid, uid, pick(uid_savings), "income", money(amount), "Upwork",
                             "Upwork", cat_ids["Freelance Income"], d, None, None, None, None, 0,
                             "manual", 0, 1, uid, uid, dt.datetime.combine(d, dt.time(15, 0), tzinfo=dt.timezone.utc),
                             dt.datetime.combine(d, dt.time(15, 0), tzinfo=dt.timezone.utc)))
                net_by[(txns[-1][1], d)] = net_by.get((txns[-1][1], d), 0) + amount

            n_exp = rng.randint(*expense_plan[uid])
            for _ in range(n_exp):
                d = month_start + dt.timedelta(days=rng.randint(0, month_len - 1))
                cat_name = rng.choices(list(MERCHANTS.keys()), weights=SPEND_WEIGHTS, k=1)[0]
                amount = money(rand(*AMOUNT_RANGE[cat_name]))
                merchant = pick(MERCHANTS[cat_name])
                acct = pick(uid_savings + uid_wallets + uid_ccs)
                category_id = cat_ids[cat_name] if rng.random() < 0.92 else pick([user_cat_ids[(uid, n)] for n in user_cats])
                txid = new_id()
                source = "import" if rng.random() < 0.12 else "manual"
                batch = pick(used_batches) if source == "import" else None
                shared = group_ids[0] if uid == user_ids[0] and rng.random() < 0.05 else None
                txns.append((txid, uid, acct, "expense", amount, f"{merchant} - {cat_name}",
                             clean_merchant(merchant), category_id, d, None, batch,
                             None, shared, 0, source, 1 if rng.random() < 0.02 else 0,
                             1, uid, uid, dt.datetime.combine(d, dt.time(12, 0), tzinfo=dt.timezone.utc),
                             dt.datetime.combine(d, dt.time(12, 0), tzinfo=dt.timezone.utc)))
                net_by[(acct, d)] = net_by.get((acct, d), 0) - amount
                spent_by[(uid, category_id, y, mo)] = spent_by.get((uid, category_id, y, mo), 0) + amount
                spent_overall[(uid, y, mo)] = spent_overall.get((uid, y, mo), 0) + amount

                if (uid, merchant) not in seen_mappings:
                    seen_mappings[(uid, merchant)] = None
                    mappings.append((uid, merchant, clean_merchant(merchant), category_id,
                                     rng.randint(1, 40), NOW - dt.timedelta(days=rng.randint(1, 30)),
                                     1 if rng.random() < 0.2 else 0))

                if rng.random() < 0.35:
                    tag_name = pick(tag_pool)
                    tt_rows.append((uid, txid, tag_ids[(uid, tag_name)]))

                if rng.random() < 0.12 and split_count < 120:
                    split_count += 1
                    others = rng.sample([cid for cname, cid in cat_ids.items()
                                         if cname not in ("Income", "Salary", "Business Income")], k=min(2, len([c for c in cat_ids if c not in ("Income", "Salary", "Business Income")])))
                    share = money(amount * rand(0.25, 0.5))
                    splits_rows.append((uid, txid, others[0], share, "split", 1))
                    splits_rows.append((uid, txid, others[1] if len(others) > 1 else others[0],
                                        money(amount - share), "split", 1))

        n_transfers = transfer_plan[uid]
        for _ in range(n_transfers):
            d = days_ago(rng.randint(1, 540 if uid == user_ids[0] else 360))
            group = new_id()
            from_a, to_a = pick(uid_savings), pick(uid_fds + uid_ccs)
            if rng.random() < 0.5:
                from_a, to_a = to_a, from_a
            amount = money(rand(2000, 60000))
            from_tx = new_id()
            to_tx = new_id()
            txns.append((from_tx, uid, from_a, "transfer", amount, f"Transfer to {to_a[:8]}",
                         None, None, d, None, None, group, None, 0, "manual", 0, 1,
                         uid, uid, dt.datetime.combine(d, dt.time(10, 0), tzinfo=dt.timezone.utc),
                         dt.datetime.combine(d, dt.time(10, 0), tzinfo=dt.timezone.utc)))
            txns.append((to_tx, uid, to_a, "transfer", amount, f"Transfer from {from_a[:8]}",
                         None, None, d, None, None, group, None, 0, "manual", 0, 1,
                         uid, uid, dt.datetime.combine(d, dt.time(10, 0), tzinfo=dt.timezone.utc),
                         dt.datetime.combine(d, dt.time(10, 0), tzinfo=dt.timezone.utc)))
            transfers.append((uid, group, from_a, to_a, from_tx, to_tx, amount, d, None, 1))
            net_by[(from_a, d)] = net_by.get((from_a, d), 0) - amount
            net_by[(to_a, d)] = net_by.get((to_a, d), 0) + amount

    txns_cols = ["id", "user_id", "account_id", "type", "amount", "description", "merchant_clean",
                 "category_id", "date", "notes", "import_batch_id", "transfer_group_id",
                 "group_id", "is_recurring", "source", "needs_review", "version", "created_by",
                 "updated_by", "created_at", "updated_at"]
    insert(conn, "transactions", txns_cols, txns)
    insert(conn, "account_transfers", ["user_id", "transfer_group_id", "from_account_id",
                                       "to_account_id", "from_transaction_id", "to_transaction_id",
                                       "amount", "date", "notes", "version"], transfers)
    insert(conn, "merchant_mappings", ["user_id", "merchant_raw", "merchant_clean", "category_id",
                                       "use_count", "last_used_at", "is_user_override"], mappings)
    insert(conn, "tags_transactions", ["user_id", "transaction_id", "tag_id"], tt_rows)
    insert(conn, "transaction_splits", ["user_id", "transaction_id", "category_id", "amount",
                                        "notes", "version"], splits_rows)

    recurring = []
    rec_templates = [
        ("income", 85000, "Acme Corp Salary", "Salary", "monthly"),
        ("expense", 15000, "House Rent", "Housing", "monthly"),
        ("expense", 1200, "Internet Broadband", "Internet", "monthly"),
        ("expense", 649, "Netflix", "Subscriptions", "monthly"),
        ("expense", 999, "Cult.fit", "Subscriptions", "monthly"),
        ("expense", 3000, "Electricity Bill", "Electricity", "monthly"),
    ]
    for uid in user_ids:
        uid_savings = [a for a in savings if meta[a][0] == uid]
        for i, (rtype, amount, desc, cat_name, freq) in enumerate(rec_templates):
            category_id = cat_ids.get(cat_name) or pick(list(user_cat_ids.values()))
            recurring.append((uid, pick(uid_savings), rtype, amount, desc, category_id, freq, 1,
                              "never", None, None,
                              dt.date(TODAY.year, TODAY.month, 1) + dt.timedelta(days=15),
                              1 if rng.random() < 0.9 else 0, 1))
    insert(conn, "recurring_transaction_templates", ["user_id", "account_id", "type", "amount",
                                                     "description", "category_id", "frequency",
                                                     "interval_value", "end_type", "end_count",
                                                     "end_date", "next_due_date", "is_active",
                                                     "version"], recurring)

    import_errors = []
    for uid in user_ids:
        for k in range(15):
            import_errors.append((uid, pick(batch_ids[uid]), rng.randint(1, 200),
                                  f"CSV row {k}", pick(["missing amount", "invalid date",
                                                        "duplicate transaction", "unknown category"]),
                                  NOW - dt.timedelta(days=rng.randint(5, 90))))
    insert(conn, "import_errors", ["user_id", "import_batch_id", "row_number", "raw_data",
                                   "error_reason", "created_at"], import_errors)

    return {"net_by": net_by, "spent_by": spent_by, "spent_overall": spent_overall}

# ---------------------------------------------------------------------------
# Module 3: Budgets
# ---------------------------------------------------------------------------

def m3_budgets(conn, user_ids: list[int], spent_by: dict, spent_overall: dict,
               cat_ids: dict[str, str]) -> None:
    budgets: list[tuple] = []
    alerts: list[tuple] = []
    rollovers: list[tuple] = []
    budget_ids: dict[tuple[int, str | None, int, int], str] = {}

    for uid in user_ids:
        months = sorted({(y, m) for (u, c, y, m) in spent_by if u == uid} |
                        {(y, m) for (u, y, m) in spent_overall if u == uid})
        for (y, m) in months:
            overall_spent = spent_overall.get((uid, y, m), 0)
            for (u, c, cy, cm), spent in spent_by.items():
                if u != uid or (cy, cm) != (y, m):
                    continue
                if spent <= 0:
                    continue
                amount = max(500.0, money(spent * rand(0.75, 1.35)))
                bid = new_id()
                budget_ids[(uid, c, y, m)] = bid
                rollover = 1 if rng.random() < 0.35 else 0
                budgets.append((bid, uid, c, amount, "monthly", m, y, 1, 1, 1, rollover,
                                1, 1, uid, uid, None, None, NOW - dt.timedelta(days=400),
                                NOW - dt.timedelta(days=rand(0, 30))))

            if overall_spent > 0:
                amount = max(1000.0, money(overall_spent * rand(0.85, 1.2)))
                bid = new_id()
                budget_ids[(uid, None, y, m)] = bid
                budgets.append((bid, uid, None, amount, "monthly", m, y, 1, 1, 1, 0,
                                1, 1, uid, uid, None, None, NOW - dt.timedelta(days=400),
                                NOW - dt.timedelta(days=rand(0, 30))))

    for (uid, c, y, m), bid in budget_ids.items():
        if c is None:
            spent = spent_overall.get((uid, y, m), 0)
        else:
            spent = spent_by.get((uid, c, y, m), 0)
        b = next((b for b in budgets if b[1] == uid and b[2] == c and b[5] == m and b[6] == y), None)
        if b is None:
            continue
        amount = b[3]
        util = spent / amount * 100
        for thr in (50, 80, 100):
            if util >= thr:
                alerts.append((uid, bid, thr, min(round(util, 2), 999.99),
                               money(spent), amount, 1 if rng.random() < 0.4 else 0,
                               1, NOW - dt.timedelta(days=rng.randint(0, 25))))

    for (uid, c, y, m), bid in budget_ids.items():
        roll = next((b for b in budgets if b[1] == uid and b[2] == c and b[5] == m and b[6] == y and b[10] == 1), None)
        if roll is None:
            continue
        if c is None:
            spent = spent_overall.get((uid, y, m), 0)
        else:
            spent = spent_by.get((uid, c, y, m), 0)
        if spent < roll[3]:
            ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
            applied = budget_ids.get((uid, c, ny, nm))
            rollovers.append((uid, bid, m, y, money(min(roll[3] - spent, 25000)),
                              applied, 1, NOW - dt.timedelta(days=rand(0, 30))))

    insert(conn, "budgets", ["id", "user_id", "category_id", "amount", "period", "month", "year",
                             "alert_50", "alert_80", "alert_100", "rollover_enabled", "is_active",
                             "version", "created_by", "updated_by", "deleted_at", "deleted_by",
                             "created_at", "updated_at"], budgets)
    insert(conn, "budget_alerts", ["user_id", "budget_id", "threshold", "utilization_pct",
                                   "spent_amount", "budget_amount", "is_dismissed", "version",
                                   "created_at"], alerts)
    insert(conn, "budget_rollovers", ["user_id", "budget_id", "from_month", "from_year",
                                      "rollover_amount", "applied_to_budget_id", "version",
                                      "created_at"], rollovers)

    templates = []
    items = []
    for i, uid in enumerate(user_ids):
        for k, (tname, is_default) in enumerate([("My Monthly Budget", 1), ("Frugal Plan", 0)]):
            tid = new_id()
            templates.append((tid, uid, tname, f"Template {k + 1} for user {i + 1}", is_default,
                              1, NOW - dt.timedelta(days=300), NOW - dt.timedelta(days=10)))
            for cat_name in rng.sample(list(MERCHANTS.keys()), k=10):
                items.append((uid, tid, cat_ids[cat_name], money(rand(1000, 15000))))
    insert(conn, "budget_templates", ["id", "user_id", "name", "description", "is_default",
                                      "version", "created_at", "updated_at"], templates)
    insert(conn, "budget_items", ["user_id", "template_id", "category_id", "amount"], items)


# ---------------------------------------------------------------------------
# Module 4: Bills & Subscriptions
# ---------------------------------------------------------------------------

BILL_NAMES = [
    ("Rent", 15000, "Housing", "monthly", 5), ("Electricity", None, "Electricity", "monthly", 10),
    ("Water Bill", None, "Water", "monthly", 8), ("Internet", 1200, "Internet", "monthly", 7),
    ("Mobile Recharge", 299, "Mobile Recharge", "monthly", 3), ("Gym Membership", 1500, "Personal Care", "monthly", 2),
    ("Society Maintenance", 2500, "Housing", "monthly", 15), ("DTH Recharge", 350, "Entertainment", "monthly", 12),
    ("School Fees", 8000, "Kids School", "monthly", 6), ("Insurance Premium", None, "Insurance", "quarterly", 20),
    ("Property Tax", None, "Housing", "annual", 30), ("Club Membership", 5000, "Personal Care", "annual", 18),
    ("Vehicle Insurance", None, "Insurance", "annual", 25), ("Gas Cylinder", 1050, "Groceries", "monthly", 14),
    ("Medical Premium", None, "Insurance", "quarterly", 22), ("Library Fee", 200, "Education", "monthly", 9),
]

SUBS = [
    ("Netflix", 649, "Subscriptions", "monthly"), ("Amazon Prime", 299, "Subscriptions", "monthly"),
    ("Hotstar", 149, "Subscriptions", "monthly"), ("Spotify", 119, "Subscriptions", "monthly"),
    ("YouTube Premium", 129, "Subscriptions", "monthly"), ("iCloud+", 75, "Subscriptions", "monthly"),
    ("Google One", 130, "Subscriptions", "monthly"), ("Cult.fit", 999, "Personal Care", "monthly"),
    ("LinkedIn Premium", 799, "Subscriptions", "monthly"), ("Coursera Plus", 3500, "Education", "annual"),
    ("Audible", 199, "Subscriptions", "monthly"), ("Canva Pro", 300, "Subscriptions", "monthly"),
    ("Notion Plus", 240, "Subscriptions", "monthly"), ("Adobe CC", 1700, "Subscriptions", "monthly"),
    ("Zomato Gold", 100, "Food & Dining", "monthly"), ("Swiggy One", 100, "Food & Dining", "monthly"),
    ("Uber One", 149, "Transport", "monthly"), ("BookMyShow Plus", 199, "Entertainment", "monthly"),
    ("Kindle Unlimited", 169, "Subscriptions", "monthly"), ("1Password", 300, "Subscriptions", "monthly"),
]


def m4_bills(conn, user_ids: list[int], cat_ids: dict[str, str],
             meta: dict[str, tuple[int, str, float]]) -> None:
    bill_rows: list[tuple] = []
    sub_rows: list[tuple] = []
    hist_rows: list[tuple] = []
    reminder_rows: list[tuple] = []
    audit_rows: list[tuple] = []
    today_m = (TODAY.year, TODAY.month)

    for uid in user_ids:
        uid_savings = [a for a, (u, t, _) in meta.items() if u == uid and t == "bank_savings"]
        for i, (name, amount, cat, freq, due) in enumerate(BILL_NAMES):
            bid = new_id()
            amount = amount if amount else money(rand(400, 6000))
            status = pick(["paid", "paid", "overdue", "upcoming", "due_soon"])
            bill_rows.append((bid, uid, name, amount, money(amount * rand(0.9, 1.1)), due, freq,
                              pick(uid_savings), cat_ids.get(cat), rng.randint(1, 5),
                              1 if rng.random() < 0.3 else 0,
                              f"auto-pay for {name}" if rng.random() < 0.3 else None,
                              status, 1 if rng.random() < 0.95 else 0, 1))
            reminder_rows.append((uid, bid, rng.randint(1, 5), 1, NOW - dt.timedelta(days=30)))
            for back in range(12):
                pm = today_m[1] - back
                py = today_m[0]
                if pm <= 0:
                    pm += 12
                    py -= 1
                if back >= 2 and (name == "Rent" or name == "Internet"):
                    continue
                hist_rows.append((uid, "bill", bid, None, amount, f"{py}-{pm:02d}", pm, py,
                                  None, NOW - dt.timedelta(days=back * 30 + rng.randint(0, 5))))

        for i, (sname, amount, cat, freq) in enumerate(SUBS):
            sid = new_id()
            status = pick(["active", "active", "paused", "cancelled"])
            renew = TODAY + dt.timedelta(days=rng.randint(1, 30))
            sub_rows.append((sid, uid, sname, amount, freq, renew, pick(uid_savings),
                             cat_ids.get(cat), status,
                             f"{sname} subscription" if rng.random() < 0.8 else None, 1))
            audit_rows.append((uid, sid, pick(["price_change", "duplicate", "unused", "overlapping"]),
                               f"{sname} plan review", "Consider downgrading to annual",
                               money(rand(500, 4000)) if rng.random() < 0.6 else None,
                               1 if rng.random() < 0.5 else 0, NOW - dt.timedelta(days=rng.randint(1, 30))))
            for back in range(12):
                pm = today_m[1] - back
                py = today_m[0]
                if pm <= 0:
                    pm += 12
                    py -= 1
                hist_rows.append((uid, "subscription", sid, None, amount, f"{py}-{pm:02d}", pm, py,
                                  None, NOW - dt.timedelta(days=back * 30 + rng.randint(0, 5))))

    insert(conn, "bills", ["id", "user_id", "name", "amount", "estimated_amount", "due_day",
                           "frequency", "account_id", "category_id", "reminder_days", "is_autopay",
                           "notes", "current_period_status", "is_active", "version"], bill_rows)
    insert(conn, "subscriptions", ["id", "user_id", "service_name", "amount", "frequency",
                                   "next_renewal_date", "account_id", "category_id", "status",
                                   "notes", "version"], sub_rows)
    insert(conn, "payment_history", ["user_id", "payable_type", "payable_id", "transaction_id",
                                     "amount", "period_label", "period_month", "period_year",
                                     "notes", "created_at"], hist_rows)
    insert(conn, "bill_reminders", ["user_id", "bill_id", "days_before", "is_active",
                                    "created_at"], reminder_rows)
    insert(conn, "subscription_audits", ["user_id", "subscription_id", "audit_type", "finding",
                                         "recommendation", "potential_savings", "is_dismissed",
                                         "created_at"], audit_rows)

# ---------------------------------------------------------------------------
# Module 5: Savings & Goals
# ---------------------------------------------------------------------------

GOAL_POOL = [
    "Emergency Fund", "Goa Vacation", "Kerala Trip", "New iPhone", "MacBook Pro", "Car Down Payment",
    "Home Down Payment", "Wedding Fund", "Retirement Corpus", "Kids Education", "MBA Fees",
    "Gold Ring", "Bike Purchase", "Sofa Set", "Gaming PC", "Desk Setup", "Sony Headphones",
    "Nikon Camera", "Europe Trip", "Fitness Equipment", "Smart Watch", "Dining Table",
    "RO Purifier", "Air Conditioner", "Refrigerator", "Washing Machine", "CCTV Setup",
    "Solar Panels", "Home Renovation", "Parents Health Fund", "Sister's Wedding", "Nephew's Education",
    "Charity Fund", "New Wardrobe", "Winter Jacket", "Gaming Console", "VR Headset",
    "Standing Desk", "Home Theater", "Projector", "Coffee Machine", "Air Fryer", "Robot Vacuum",
    "Smart TV", "Speaker System", "Acoustic Guitar", "Music Production Kit", "Art Classes",
    "Photography Course", "Kitchen Remodel", "Balcony Garden", "Pet Adoption Fund",
]


def m5_goals(conn, user_ids: list[int], meta: dict[str, tuple[int, str, float]]) -> None:
    goal_rows: list[tuple] = []
    contrib_rows: list[tuple] = []
    snap_rows: list[tuple] = []
    mile_rows: list[tuple] = []
    user_templates: list[tuple] = []

    for uid in user_ids:
        uid_savings = [a for a, (u, t, _) in meta.items() if u == uid and t == "bank_savings"]
        if not uid_savings:
            uid_savings = [a for a, (u, _, _) in meta.items() if u == uid][:1]
        for k in range(70):
            gid = new_id()
            name = GOAL_POOL[k % len(GOAL_POOL)] + ("" if k < len(GOAL_POOL) else f" {k // len(GOAL_POOL) + 1}")
            target = money(round(rand(20000, 2000000) / 5000) * 5000)
            months = rng.randint(6, 18)
            start = dt.date(TODAY.year, TODAY.month, 1) - dt.timedelta(days=months * 31)
            priority = pick(["high", "medium", "low"])
            monthly = target / months
            cumulative = 0.0
            reached_complete = None
            paused_at = None
            status = "active"
            if rng.random() < 0.1:
                paused_at = rng.randint(1, months)
                status = "paused"
            for i in range(months):
                if paused_at and i >= paused_at:
                    break
                d = dt.date(TODAY.year, TODAY.month, 1) - dt.timedelta(days=(months - i) * 31)
                amt = money(monthly * rand(0.6, 1.4))
                cumulative = money(cumulative + amt)
                contrib_rows.append((uid, gid, amt, d, None, "sip"))
                snap_rows.append((uid, gid, cumulative, d))
                if cumulative >= target and reached_complete is None:
                    reached_complete = d
            for pct in (25, 50, 75, 100):
                if cumulative >= target * pct / 100:
                    mile_rows.append((uid, gid, pct, reached_complete if pct == 100 else
                                      dt.date(TODAY.year, TODAY.month, 1) - dt.timedelta(days=rng.randint(30, months * 31)),
                                      NOW - dt.timedelta(days=rng.randint(1, 100)),
                                      NOW - dt.timedelta(days=rng.randint(1, 100)) if rng.random() < 0.8 else None))
            completed = "completed" if cumulative >= target else status
            goal_rows.append((gid, uid, name, target,
                              TODAY + dt.timedelta(days=rng.randint(30, 400)),
                              priority, completed, pick(uid_savings),
                              pick(["#42A5F5", "#66BB6A", "#FFA726", "#AB47BC"]),
                              f"Automated {name.lower()} goal", None,
                              reached_complete if completed == "completed" else None, 1))
        for k, (tname, is_default) in enumerate([("My Savings Plan", 1), ("Aggressive Saver", 0)]):
            user_templates.append((uid, tname, f"Personal template {k + 1}",
                                   money(rand(10000, 200000)), rng.randint(6, 24), "flag",
                                   0, 1))

    insert(conn, "goals", ["id", "user_id", "name", "target", "target_date",
                           "priority", "status", "account_id", "color", "notes", "template_used",
                           "completed_at", "version"], goal_rows)
    insert(conn, "goal_contributions", ["user_id", "goal_id", "amount", "date",
                                        "transaction_id", "notes"], contrib_rows)
    insert(conn, "goal_snapshots", ["user_id", "goal_id", "current_amount", "date"], snap_rows)
    insert(conn, "goal_milestones", ["user_id", "goal_id", "milestone_pct", "reached_date",
                                     "notified_at", "created_at"], mile_rows)
    insert(conn, "goal_templates", ["user_id", "name", "description", "default_target_amount",
                                    "default_timeframe_months", "icon", "is_system",
                                    "version"], user_templates)


# ---------------------------------------------------------------------------
# Module 6: Debt & Loans
# ---------------------------------------------------------------------------

def amortize(principal: float, annual_rate: float, months: int):
    r = annual_rate / 100 / 12
    if r == 0:
        emi = principal / months
    else:
        emi = principal * r * (1 + r) ** months / ((1 + r) ** months - 1)
    out = principal
    cum_interest = 0.0
    rows = []
    for k in range(1, months + 1):
        interest = out * r
        p = emi - interest
        if k == months:
            p = out
        out -= p
        if out < 0:
            out = 0.0
        cum_interest += interest
        rows.append((k, emi, p, interest, out, cum_interest))
    return rows


def m6_debts(conn, user_ids: list[int], meta: dict[str, tuple[int, str, float]]) -> dict[int, float]:
    debt_rows: list[tuple] = []
    sched_rows: list[tuple] = []
    pay_rows: list[tuple] = []
    outstanding_total: dict[int, float] = {uid: 0.0 for uid in user_ids}
    LOANS = [
        ("home_loan", "Home Loan", 4200000, 8.4, 240, 24, "SBI"),
        ("car_loan", "Car Loan", 900000, 9.2, 60, 18, "HDFC Bank"),
        ("personal_loan", "Personal Loan", 300000, 11.5, 36, 9, "ICICI Bank"),
        ("education_loan", "Education Loan", 800000, 8.1, 96, 30, "State Bank"),
        ("car_loan", "Bike Loan", 120000, 10.5, 24, 6, "Bajaj Finance"),
        ("other", "Shop Equipment Loan", 50000, 12.0, 18, 12, "Fintech Ltd"),
    ]

    for uid in user_ids:
        uid_savings = [a for a, (u, t, _) in meta.items() if u == uid and t == "bank_savings"]
        loans = LOANS if uid == user_ids[0] else LOANS[2:]
        for i, (dtype, dname, principal, rate, tenure, elapsed, lender) in enumerate(loans):
            did = new_id()
            closed = uid == user_ids[0] and dname == "Education Loan" and elapsed >= 96
            schedule = amortize(principal, rate, tenure)
            elapsed = tenure if closed else min(elapsed, tenure)
            end = dt.date.today() - dt.timedelta(days=30 * (tenure - elapsed))
            debt_rows.append((did, uid, f"{lender} {dname}", dtype, lender, principal,
                              schedule[elapsed - 1][4] if elapsed > 0 else principal,
                              rate, schedule[0][1], None, tenure,
                              tenure - elapsed if not closed else 0,
                              days_ago(540 - i * 30), end, pick(uid_savings),
                              schedule[elapsed - 1][5] if elapsed > 0 else 0,
                              0 if closed else 1,
                              f"{dtype} EMI {elapsed}/{tenure} paid" if not closed else "Loan closed",
                              days_ago(30) if closed else None, 1,
                              uid, uid, None, None,
                              NOW - dt.timedelta(days=560 - i * 30),
                              NOW - dt.timedelta(days=30)))
            outstanding_total[uid] += schedule[elapsed - 1][4] if elapsed > 0 else principal
            for k, period, emi, p, interest, out, cum in (
                    (k, *row) for k, row in enumerate(schedule, start=1)):
                sched_rows.append((uid, did, period, money(emi), money(p), money(interest),
                                   money(out), money(cum),
                                   dt.date.today() - dt.timedelta(days=30 * (tenure - period)),
                                   NOW - dt.timedelta(days=rng.randint(1, 400))))
                if period <= elapsed:
                    pay_rows.append((uid, did, "emi", money(emi), money(p), money(interest),
                                     money(out), dt.date.today() - dt.timedelta(days=30 * (tenure - period)),
                                     None, f"EMI #{period}"))

        for k in range(14):
            did = new_id()
            outstanding = money(rand(8000, 60000))
            rate = rand(24, 42)
            min_due = money(outstanding * rand(0.03, 0.05))
            start = days_ago(rng.randint(60, 400))
            cc = uid_savings and pick(uid_savings)
            debt_rows.append((did, uid, f"{pick(['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak'])} Credit Card Dues",
                              "credit_card", pick(["HDFC", "ICICI", "SBI"]), outstanding, outstanding,
                              rate, None, min_due, None, None, start, None, cc,
                              money(outstanding * 0.03 * 6), 1,
                              "Revolving credit card balance", None, 1,
                              uid, uid, None, None,
                              NOW - dt.timedelta(days=rng.randint(60, 400)), NOW))
            outstanding_total[uid] += outstanding
            remaining = outstanding
            for m in range(6):
                interest = remaining * rate / 100 / 12
                amt = min(min_due, remaining + interest)
                p = max(0.0, amt - interest)
                remaining = max(0.0, remaining - p)
                pay_rows.append((uid, did, "emi", money(amt), money(p), money(interest),
                                 money(remaining), start + dt.timedelta(days=30 * (m + 1)),
                                 None, f"CC payment {m + 1}"))

    insert(conn, "debts", ["id", "user_id", "name", "type", "lender", "principal_original",
                           "principal_outstanding", "interest_rate", "emi_amount", "minimum_due",
                           "tenure_months", "months_remaining", "start_date", "end_date",
                           "account_id", "total_interest_paid", "is_active", "notes",
                           "closed_date", "version", "created_by", "updated_by", "deleted_at",
                           "deleted_by", "created_at", "updated_at"], debt_rows)
    insert(conn, "amortization_schedule", ["user_id", "debt_id", "period", "emi_amount",
                                           "principal_part", "interest_part", "outstanding_after",
                                           "cumulative_interest", "scheduled_date",
                                           "regenerated_at"], sched_rows)
    insert(conn, "debt_payments", ["user_id", "debt_id", "type", "amount", "principal_part",
                                   "interest_part", "outstanding_after", "date", "transaction_id",
                                   "notes"], pay_rows)
    return outstanding_total

# ---------------------------------------------------------------------------
# Module 7: Tax Planning
# ---------------------------------------------------------------------------

MF_NAMES = [
    "HDFC Flexi Cap Fund", "Parag Parikh Flexi Cap", "SBI Bluechip Fund", "Axis Small Cap Fund",
    "Mirae Asset Large Cap", "ICICI Prudential Value", "Quant Active Fund", "Nippon India Small Cap",
    "UTI Nifty 50 Index", "Kotak Emerging Equity", "Aditya Birla Frontline", "Franklin India Prima",
    "Tata Digital India", "Motilal Oswal Midcap", "PGIM India Midcap", "Nippon India Growth",
    "SBI Magnum Midcap", "DSP Small Cap", "HDFC Small Cap", "Axis Midcap",
]

STOCK_NAMES = [
    "Tata Motors", "Reliance Industries", "HDFC Bank", "Infosys", "TCS", "ITC", "Asian Paints",
    "Bajaj Finance", "Maruti Suzuki", "SBI", "ICICI Bank", "L&T", "Wipro", "Adani Green",
    "Zomato", "IRCTC",
]

TAX_ITEMS = [
    ("80C", "HDFC ELSS Tax Saver", 50000), ("80C", "SBI ELSS", 40000), ("80C", "Axis ELSS", 25000),
    ("80C", "PPF Contribution", 30000), ("80C", "EPF Contribution", 10000), ("80C", "Life Insurance Premium", 15000),
    ("80CCD-1B", "NPS Tier 1 - Additional", 30000), ("80CCD-1B", "NPS Tier 2", 20000),
    ("80D", "Health Insurance - Self", 25000), ("80D", "Health Insurance - Parents", 20000),
    ("80D", "Preventive Health Checkup", 5000),
    ("80E", "Education Loan Interest", 45000), ("80G", "Donation - Temple Trust", 10000),
    ("80G", "Donation - NGO", 5000), ("24B", "Home Loan Interest", 120000),
    ("80TTA", "Savings Interest", 8000), ("HRA", "Rent Receipts", 180000), ("LTA", "Travel Bills", 20000),
]


def m7_tax(conn, user_ids: list[int]) -> None:
    inv_rows: list[tuple] = []
    sal_rows: list[tuple] = []
    itr_rows: list[tuple] = []
    for uid in user_ids:
        for fy in ("FY-2024-25", "FY-2025-26"):
            for k in range(36):
                section, name, amt = TAX_ITEMS[k % len(TAX_ITEMS)]
                fy_start = dt.date(int(fy.split("-")[1]) - 1 if fy == "FY-2024-25" else 2025, 4, 1)
                inv_rows.append((uid, section, fy, f"{name} {k // len(TAX_ITEMS) + 1}",
                                 money(amt * rand(0.8, 1.0)),
                                 fy_start + dt.timedelta(days=rng.randint(0, 340)),
                                 pick(["pending", "collected", "collected", "submitted"]),
                                 None, None, 1))
            is_salaried = uid != user_ids[2]
            basic = 45000 if uid == user_ids[0] else 35000
            sal_rows.append((uid, fy, "salaried" if is_salaried else "business",
                             basic if is_salaried else None,
                             basic * 0.44 if is_salaried else None,
                             12000 if is_salaried else None,
                             basic * 0.22 if is_salaried else None,
                             5400 if is_salaried else None,
                             18000 if is_salaried else None,
                             2000 if is_salaried else None,
                             round((basic + basic * 0.44 + basic * 0.22) * 12 + 12000, 2) if is_salaried else 480000,
                             money(rand(0, 50000)), money(rand(15000, 40000)) if is_salaried else 0))
        for k in range(40):
            cat = pick(["form16", "26as", "proof", "statement", "other"])
            fy = pick(["FY-2024-25", "FY-2025-26"])
            itr_rows.append((uid, fy, cat,
                             pick([f"Form 16 - {fy}", f"Form 26AS - {fy}", "ELSS statement",
                                   "PPF passbook", "Health premium receipt", "Donation receipt",
                                   "Bank interest statement", "Rent receipts", "Home loan certificate",
                                   "Salary slip archive"]),
                             pick(["pending", "collected", "collected", "submitted"]),
                             1 if rng.random() < 0.8 else 0, None))
    insert(conn, "tax_investments", ["user_id", "section_id", "financial_year", "name", "amount",
                                     "investment_date", "proof_status", "transaction_id", "notes",
                                     "version"], inv_rows)
    insert(conn, "salary_structures", ["user_id", "financial_year", "employment_type",
                                       "basic_monthly", "hra_monthly", "lta_annual",
                                       "special_allowances", "employer_pf", "actual_rent_monthly",
                                       "other_exemptions", "gross_annual_income",
                                       "additional_income", "tds_deducted"], sal_rows)
    insert(conn, "itr_documents", ["user_id", "financial_year", "category", "document_name",
                                   "status", "is_suggested", "notes"], itr_rows)


# ---------------------------------------------------------------------------
# Module 8: Investment Tracker
# ---------------------------------------------------------------------------

def m8_investments(conn, user_ids: list[int],
                   meta: dict[str, tuple[int, str, float]]) -> dict[int, tuple[float, float]]:
    inv_rows: list[tuple] = []
    itx_rows: list[tuple] = []
    snap_rows: list[tuple] = []
    price_rows: list[tuple] = []
    div_rows: list[tuple] = []
    sip_rows: list[tuple] = []
    port_by_month: dict[tuple[int, dt.date], list[float]] = {}

    for uid in user_ids:
        uid_accounts = {t: [a for a, (u, tt, _) in meta.items() if u == uid and tt == t]
                        for t in ("bank_savings", "fd", "ppf", "credit_card")}
        savings = uid_accounts["bank_savings"] or [a for a, (u, _, _) in meta.items() if u == uid][:1]
        for k in range(70):
            iid = new_id()
            kind = k % 10
            purchase = days_ago(rng.randint(30, 540))
            if kind < 5:
                name = MF_NAMES[k % len(MF_NAMES)]
                buy = rand(20, 150)
                price = buy * (1 + rand(-0.15, 0.35))
                units = round(rand(500, 2000), 2)
                itype = "mutual_fund"
                cat = "equity"
                acct = pick(savings)
            elif kind < 7:
                name = STOCK_NAMES[k % len(STOCK_NAMES)]
                buy = rand(200, 3000)
                price = buy * (1 + rand(-0.3, 0.5))
                units = round(rand(1, 40), 4)
                itype = "stock"
                cat = "equity"
                acct = pick(savings)
            elif kind == 7:
                invested = money(rand(100000, 500000))
                buy = price = invested
                units = 1
                itype = "fd"
                cat = "debt"
                acct = pick(uid_accounts["fd"]) if uid_accounts["fd"] else pick(savings)
            elif kind == 8:
                invested = money(rand(50000, 200000))
                buy = price = invested
                units = 1
                itype = "ppf"
                cat = "government"
                acct = pick(uid_accounts["ppf"]) if uid_accounts["ppf"] else pick(savings)
            else:
                buy = rand(6000, 7500)
                price = buy * rand(1.05, 1.2)
                units = round(rand(5, 50), 3)
                itype = "gold"
                cat = "gold"
                acct = pick(savings)

            invested_val = units * buy
            current_val = units * price
            mode = "unit" if itype in ("mutual_fund", "stock", "gold") else "manual"
            maturity = purchase + dt.timedelta(days=365) if itype == "fd" else None
            inv_rows.append((iid, uid, name, itype, cat, mode, units, buy, price, purchase,
                             maturity, acct, 1,
                             f"Auto portfolio {k + 1}" if rng.random() < 0.7 else None, None, 1))
            itx_rows.append((uid, iid, "buy", units, buy, money(invested_val), purchase, None,
                             f"Initial purchase"))
            if itype in ("stock", "mutual_fund") and rng.random() < 0.4:
                sell_units = round(units * rand(0.15, 0.4), 4)
                sell_date = purchase + dt.timedelta(days=rng.randint(60, 300))
                itx_rows.append((uid, iid, "sell", sell_units, price * rand(0.9, 1.1),
                                 money(sell_units * price), sell_date, None, "Partial sale"))

            months_since = max(1, (TODAY.replace(day=1) - purchase.replace(day=1)).days // 31)
            span = min(12, months_since)
            for i in range(span):
                d = (TODAY.replace(day=1) - dt.timedelta(days=i * 31)).replace(day=1)
                factor = i / (span - 1) if span > 1 else 1
                cur = units * (buy + (price - buy) * factor)
                snap_rows.append((uid, iid, money(invested_val), money(cur), d))
                price_rows.append((uid, iid, money(buy + (price - buy) * factor), d,
                                   NOW - dt.timedelta(days=i * 31 + rng.randint(0, 5))))
                key = (uid, d)
                if key not in port_by_month:
                    port_by_month[key] = [0.0, 0.0]
                port_by_month[key][0] += invested_val
                port_by_month[key][1] += cur

            if itype in ("stock", "mutual_fund") and rng.random() < 0.5:
                for j in range(2):
                    d = purchase + dt.timedelta(days=180 * (j + 1))
                    if d <= TODAY:
                        div_rows.append((uid, iid, pick(["dividend", "dividend", "interest"]),
                                         money(current_val * rand(0.005, 0.03)), d, None, "payout"))

            if itype == "mutual_fund" and rng.random() < 0.75:
                sip_rows.append((uid, iid, money(rand(2000, 10000)), pick(["monthly", "quarterly"]),
                                 dt.date(TODAY.year, TODAY.month, 1) + dt.timedelta(days=20),
                                 pick(savings), "active", purchase,
                                 purchase + dt.timedelta(days=rand(365, 1095)), None))

    portfolio = []
    for (uid, d), (inv, cur) in sorted(port_by_month.items()):
        portfolio.append((uid, d, money(inv), money(cur)))

    insert(conn, "investments", ["id", "user_id", "name", "type", "category", "valuation_mode",
                                 "units", "buy_price", "current_price", "purchase_date",
                                 "maturity_date", "account_id", "is_active", "notes",
                                 "closed_date", "version"], inv_rows)
    insert(conn, "investment_transactions", ["user_id", "investment_id", "type", "units",
                                             "price_per_unit", "total_amount", "date",
                                             "transaction_id", "notes"], itx_rows)
    insert(conn, "investment_snapshots", ["user_id", "investment_id", "invested_value",
                                          "current_value", "date"], snap_rows)
    insert(conn, "investment_price_history", ["user_id", "investment_id", "price", "date",
                                              "created_at"], price_rows)
    insert(conn, "portfolio_snapshots", ["user_id", "date", "total_invested",
                                         "total_current"], portfolio)
    insert(conn, "dividend_income", ["user_id", "investment_id", "type", "amount", "date",
                                     "transaction_id", "notes"], div_rows)
    insert(conn, "sip_trackers", ["user_id", "investment_id", "amount", "frequency", "next_date",
                                  "account_id", "status", "start_date", "end_date", "notes"], sip_rows)
    final = {}
    for uid in user_ids:
        dates = [d for (u, d) in port_by_month if u == uid]
        latest = max(dates)
        final[uid] = (money(port_by_month[(uid, latest)][0]),
                      money(port_by_month[(uid, latest)][1]))
    return final


# ---------------------------------------------------------------------------
# Module 9: Net Worth Tracker
# ---------------------------------------------------------------------------

def m9_networth(conn, user_ids: list[int], meta: dict[str, tuple[int, str, float]],
                net_by: dict, port_final: dict[int, tuple[float, float]],
                debt_out: dict[int, float]) -> None:
    asset_rows: list[tuple] = []
    snap_rows: list[tuple] = []
    mile_rows: list[tuple] = []
    net_total: dict[int, float] = {}
    for acct, (u, _, opening) in meta.items():
        net_total[u] = net_total.get(u, 0) + opening + sum(net_by.get((acct, d), 0.0) for d in range(61))

    assets_final: dict[int, float] = {}
    for uid in user_ids:
        inv, cur = port_final[uid]
        assets_final[uid] = net_total[uid] + cur
        for k in range(70):
            cat = pick(["property", "property", "property", "vehicle", "vehicle", "gold", "gold", "other", "other", "other"])
            if cat == "property":
                name = pick(["House - Bengaluru", "Land - Mysore", "Flat - Hyderabad", "Plot - Goa"])
                val = rand(1500000, 40000000)
                dep = "none"
            elif cat == "vehicle":
                name = pick(["Honda City", "Maruti Swift", "Royal Enfield Classic", "Hyundai i20",
                             "TVS Apache", "Honda Activa", "Bajaj Pulsar", "Kia Seltos"])
                val = rand(100000, 800000)
                dep = pick(["wdv", "straight_line"])
            elif cat == "gold":
                name = pick(["Gold Jewellery", "Gold Coins", "Digital Gold"])
                val = rand(10, 50) * 7800
                dep = None
            else:
                name = pick(["Diamond Ring", "Sofa Set", "Samsung TV", "MacBook Air", "Antique Clock",
                             "Dining Set", "Wardrobe", "Exercise Bike"])
                val = rand(20000, 400000)
                dep = pick(["wdv", "straight_line", None])
            asset_rows.append((uid, name, cat, money(val),
                               days_ago(rng.randint(30, 2500)), dep, None, 1))

        for t in range(24):
            d = dt.date(TODAY.year, TODAY.month, 1) - dt.timedelta(days=(23 - t) * 31)
            d = d.replace(day=1)
            factor = t / 23
            liab = (debt_out.get(uid, 0) * (1.2 - 0.2 * factor)) * rand(0.98, 1.02)
            assets = (assets_final[uid] * (0.9 + 0.1 * factor)) * rand(0.98, 1.02)
            snap_rows.append((uid, d, money(assets), money(liab)))

        mile_defs = [(100000, "First 1 Lakh Net Worth"), (250000, "2.5 Lakh Milestone"),
                     (500000, "5 Lakh Net Worth"), (1000000, "10 Lakh Net Worth"),
                     (2000000, "20 Lakh Net Worth"), (5000000, "50 Lakh Net Worth"),
                     (10000000, "1 Crore Net Worth")]
        for k in range(70):
            target, label = mile_defs[k % len(mile_defs)]
            reached = days_ago(rng.randint(5, 700)) if assets_final[uid] >= target else None
            mile_rows.append((uid, f"{label} ({k // len(mile_defs) + 1})", target, 1, reached,
                              NOW - dt.timedelta(days=rng.randint(1, 100)) if reached else None,
                              1, uid, uid, None, None, NOW - dt.timedelta(days=400),
                              NOW - dt.timedelta(days=rng.randint(0, 30))))

    insert(conn, "manual_assets", ["user_id", "name", "category", "valuation", "acquisition_date",
                                   "depreciation_method", "notes", "version"], asset_rows)
    insert(conn, "net_worth_snapshots", ["user_id", "date", "assets_total",
                                         "liabilities_total"], snap_rows)
    insert(conn, "net_worth_milestones", ["user_id", "label", "target_amount", "is_active",
                                          "reached_at", "notified_at", "version", "created_by",
                                          "updated_by", "deleted_at", "deleted_by", "created_at",
                                          "updated_at"], mile_rows)


# ---------------------------------------------------------------------------
# Module 10: Reports & Analytics
# ---------------------------------------------------------------------------

def m10_reports(conn, user_ids: list[int]) -> None:
    templates = []
    exports = []
    for uid in user_ids:
        user_tids = []
        for k, name in enumerate(["My Net Worth Report", "Family Budget Review"]):
            tid = new_id()
            user_tids.append(tid)
            templates.append((tid, uid, name, Jsonb({"chart": "line", "y": "amount",
                                                     "custom": True}), "Custom template", 1))
        for k in range(70):
            ftype = pick(["pdf", "csv"])
            status_ok = rng.random() < 0.95
            exports.append((uid, pick(user_tids) if rng.random() < 0.6 else None,
                            f"exports/{new_id()}.{ftype}" if status_ok else None,
                            ftype, days_ago(rng.randint(15, 90)), TODAY,
                            NOW - dt.timedelta(hours=rng.randint(1, 24 * 30))))
    insert(conn, "report_templates", ["id", "user_id", "name", "chart_config", "description",
                                      "version"], templates)
    insert(conn, "report_exports", ["user_id", "template_id", "file_path", "file_type",
                                    "date_range_start", "date_range_end", "created_at"], exports)


# ---------------------------------------------------------------------------
# Module 11: Secure Notes & Vault
# ---------------------------------------------------------------------------

NOTE_TITLES = [
    ("Passport", "document", "passport"), ("PAN Card", "document", "pan_card"),
    ("Aadhaar Card", "document", "aadhaar"), ("Driving License", "document", "driving_license"),
    ("Vehicle RC", "vehicle", "vehicle_rc"), ("Health Insurance Policy", "health", "health_insurance"),
    ("Vehicle Insurance Policy", "vehicle", "vehicle_insurance"), ("Gym Membership", "personal", "membership"),
    ("Bank Account Details", "financial", None), ("FD Certificates", "financial", None),
    ("PPF Statement", "financial", None), ("LIC Policy", "financial", None),
    ("NPS Account", "financial", None), ("Wi-Fi Password", "personal", None),
    ("Email Password", "personal", None), ("Safe Locker Key", "personal", None),
    ("Credit Card PIN Hint", "financial", None), ("Bank Passbook", "financial", None),
    ("House Rent Agreement", "document", None), ("Birth Certificate", "document", None),
    ("Marriage Certificate", "document", None), ("Property Documents", "document", None),
    ("Salary Slip Archive", "financial", None), ("GST Details", "financial", None),
    ("Shop Lease Deed", "document", None),
]


def m11_notes(conn, user_ids: list[int]) -> None:
    notes = []
    atts = []
    for uid in user_ids:
        for k in range(70):
            nid = new_id()
            title, cat, tpl = NOTE_TITLES[k % len(NOTE_TITLES)]
            payload = f"{title}::{k}::{nid}"
            notes.append((nid, uid, f"{title} {k // len(NOTE_TITLES) + 1}" if k >= len(NOTE_TITLES) else title,
                          cat, tpl,
                          base64.b64encode(payload.encode()).decode(),
                          hashlib.sha256(f"iv-{nid}".encode()).hexdigest()[:32],
                          1 if rng.random() < 0.12 else 0, 1, uid, uid, None, None,
                          NOW - dt.timedelta(days=rng.randint(5, 400)),
                          NOW - dt.timedelta(days=rng.randint(0, 30))))
            if rng.random() < 0.45:
                for j in range(rng.randint(1, 2)):
                    ftype = pick(["pdf", "jpg", "png", "docx"])
                    atts.append((uid, nid, f"{title.replace(' ', '_')}_{j}.{ftype}",
                                 f"notes/{new_id()}.{ftype}", ftype,
                                 rng.randint(50000, 5000000), 1,
                                 NOW - dt.timedelta(days=rng.randint(1, 200))))
    insert(conn, "secure_notes", ["id", "user_id", "title", "category", "template_code",
                                  "data_encrypted", "data_iv", "is_pinned", "version",
                                  "created_by", "updated_by", "deleted_at", "deleted_by",
                                  "created_at", "updated_at"], notes)
    insert(conn, "note_attachments", ["user_id", "note_id", "file_name", "file_path",
                                      "file_type", "file_size", "is_encrypted",
                                      "created_at"], atts)


# ---------------------------------------------------------------------------
# Component C1: Financial Calendar
# ---------------------------------------------------------------------------

def c1_calendar(conn, user_ids: list[int], meta: dict[str, tuple[int, str, float]],
                cat_ids: dict[str, str]) -> None:
    events = []
    for uid in user_ids:
        uid_savings = [a for a, (u, t, _) in meta.items() if u == uid and t == "bank_savings"]
        salaries = {user_ids[0]: 85000, user_ids[1]: 55000, user_ids[2]: 0}
        for k in range(70):
            kind = k % 4
            if kind == 0:
                name, due = pick([("Rent", 5), ("Electricity", 10), ("Internet", 7),
                                  ("Mobile Recharge", 3), ("Society Maintenance", 15)])
                title, etype, amount = f"{name} due", "expense", money(rand(300, 15000))
            elif kind == 1:
                title, etype, amount = "Salary credit", "income", float(salaries.get(uid, 0) or rand(20000, 50000))
            elif kind == 2:
                title, etype, amount = pick(["Insurance premium due", "FD maturity", "Gym renewal",
                                             "Vehicle service"]), pick(["expense", "reminder"]), money(rand(500, 20000))
            else:
                title, etype, amount = pick(["EMI due", "Bill payment reminder", "SIP instalment"]), "reminder", money(rand(1000, 30000))
            d = TODAY + dt.timedelta(days=rng.randint(1, 90))
            events.append((uid, title, d, None, etype, amount,
                           pick(uid_savings) if rng.random() < 0.7 else None,
                           pick(["#42A5F5", "#EF5350", "#66BB6A", "#FFA726"]), None,
                           1, uid, uid, None, None, NOW - dt.timedelta(days=30),
                           NOW - dt.timedelta(days=rng.randint(0, 30))))
    insert(conn, "calendar_events", ["user_id", "title", "event_date", "end_date", "event_type",
                                     "amount", "account_id", "color", "notes", "version",
                                     "created_by", "updated_by", "deleted_at", "deleted_by",
                                     "created_at", "updated_at"], events)


# ---------------------------------------------------------------------------
# Component C2: Notifications & Alerts
# ---------------------------------------------------------------------------

EMAIL_LIST = ["demo@moneymind.local", "partner@moneymind.local", "family@moneymind.local"]

NOTIF_TEMPLATES = [
    ("alert", "budget", "Budget 80% used", "You have used 80% of your {cat} budget", "high"),
    ("reminder", "bills", "Bill due soon", "Your {name} bill is due in 3 days", "medium"),
    ("reminder", "subscription", "Subscription renewal", "{name} renews tomorrow", "low"),
    ("insight", "goals", "Goal milestone reached", "You reached 50% of {name}", "medium"),
    ("alert", "debt", "EMI due", "Your {name} EMI is due this week", "high"),
    ("warning", "tax", "Tax filing reminder", "Last date for {fy} filing approaches", "medium"),
    ("insight", "investment", "Portfolio update", "Your portfolio changed {pct} this week", "low"),
    ("summary", "net_worth", "Net worth update", "Your net worth is now {amount}", "low"),
    ("info", "reports", "Report ready", "Your monthly report is ready to view", "low"),
    ("reminder", "calendar", "Upcoming event", "{name} is coming up", "low"),
    ("warning", "account", "New device login", "A new device signed in to your account", "high"),
    ("alert", "transaction", "Large transaction", "A transaction of {amount} was recorded", "medium"),
    ("info", "system", "Welcome", "Welcome to MoneyMind!", "low"),
]


def c2_notifications(conn, user_ids: list[int]) -> None:
    notif_rows = []
    email_rows = []
    prefs = []
    notif_ids: dict[int, list[str]] = {uid: [] for uid in user_ids}
    for uid in user_ids:
        for k in range(70):
            ntype, module, title, msg, priority = pick(NOTIF_TEMPLATES)
            nid = new_id()
            notif_ids[uid].append(nid)
            created = NOW - dt.timedelta(hours=rand(1, 24 * 60))
            notif_rows.append((nid, uid, ntype, module, title, msg,
                               Jsonb({"amount": money(rand(100, 50000)), "module": module}),
                               f"app://{module}", priority,
                               1 if rng.random() < 0.6 else 0,
                               1 if rng.random() < 0.2 else 0,
                               created + dt.timedelta(days=10) if rng.random() < 0.3 else None,
                               created))
        for ntype in ("budget_alert", "bill_reminder", "goal_milestone", "subscription_alert",
                      "login_alert", "summary", "tax_reminder", "emi_due", "portfolio_update",
                      "report_ready", "security", "welcome"):
            for channel in ("in_app", "email"):
                prefs.append((uid, ntype, channel, 1 if rng.random() < 0.9 else 0,
                              NOW - dt.timedelta(days=400), NOW - dt.timedelta(days=30)))
        for k in range(50):
            status = pick(["sent", "sent", "sent", "queued", "failed"])
            nid = pick(notif_ids[uid]) if rng.random() < 0.7 else None
            email_rows.append((uid, nid, pick(["budget_alert", "bill_reminder", "summary",
                                               "subscription_alert", "welcome"]),
                               EMAIL_LIST[user_ids.index(uid)],
                               status, "SMTP 421 timeout" if status == "failed" else None,
                               NOW - dt.timedelta(hours=rand(1, 100)) if status in ("sent", "failed") else None,
                               NOW - dt.timedelta(hours=rand(1, 120))))
    insert(conn, "notifications", ["id", "user_id", "type", "module", "title", "message",
                                   "data_payload", "deep_link", "priority", "is_read",
                                   "is_dismissed", "expires_at", "created_at"], notif_rows)
    insert(conn, "notification_preferences", ["user_id", "notification_type", "channel",
                                              "is_enabled", "created_at", "updated_at"], prefs)
    insert(conn, "notification_emails", ["user_id", "notification_id", "email_type", "recipient",
                                         "status", "error_message", "sent_at", "created_at"], email_rows)


# ---------------------------------------------------------------------------
# Component C3: Data Export
# ---------------------------------------------------------------------------

def c3_exports(conn, user_ids: list[int]) -> None:
    jobs = []
    modules = ["accounts", "transactions", "budgets", "bills", "goals", "debts", "tax",
               "investments", "net_worth", "reports", "secure_notes"]
    for uid in user_ids:
        for k in range(70):
            etype = pick(["csv", "csv", "csv", "pdf", "pdf", "full_archive"])
            status = pick(["completed", "completed", "completed", "completed", "failed", "queued"])
            ftype = {"csv": "csv", "pdf": "pdf", "full_archive": "zip"}[etype]
            file_path = f"exports/{new_id()}.{ftype}" if status == "completed" else None
            jobs.append((uid, etype, pick(["module", "module", "all"]),
                         pick(modules) if rng.random() < 0.8 else None,
                         days_ago(rng.randint(1, 90)), TODAY, status, file_path, ftype,
                         rng.randint(50, 50000) if status == "completed" else None,
                         rng.randint(10000, 5000000) if status == "completed" else None,
                         "disk full" if status == "failed" else None,
                         NOW - dt.timedelta(hours=rand(1, 24 * 60))))
    insert(conn, "data_export_jobs", ["user_id", "export_type", "scope", "module_name",
                                      "date_range_start", "date_range_end", "status", "file_path",
                                      "file_type", "row_count", "file_size", "error_message",
                                      "created_at"], jobs)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    t0 = time.perf_counter()
    conn = psycopg.connect(conninfo(PGDATABASE))
    try:
        with conn.pipeline():
            cat_ids = lookup_rows(conn)
            user_ids = auth_rows(conn)
            acct_rows, meta = m1_accounts(user_ids)
            insert(conn, "accounts", ["id", "user_id", "name", "type", "institution", "opening_balance",
                                      "credit_limit", "currency", "color", "notes", "is_active",
                                      "sort_order", "version", "created_by", "updated_by",
                                      "deleted_at", "deleted_by", "created_at", "updated_at"],
                   acct_rows)
            m2 = m2_transactions(conn, user_ids, cat_ids, meta)
            hist = m1_balance_history(meta, m2["net_by"])
            insert(conn, "account_balance_history", ["user_id", "account_id", "balance", "date"], hist)
            m3_budgets(conn, user_ids, m2["spent_by"], m2["spent_overall"], cat_ids)
            m4_bills(conn, user_ids, cat_ids, meta)
            m5_goals(conn, user_ids, meta)
            debt_out = m6_debts(conn, user_ids, meta)
            m7_tax(conn, user_ids)
            port_final = m8_investments(conn, user_ids, meta)
            m9_networth(conn, user_ids, meta, m2["net_by"], port_final, debt_out)
            m10_reports(conn, user_ids)
            m11_notes(conn, user_ids)
            c1_calendar(conn, user_ids, meta, cat_ids)
            c2_notifications(conn, user_ids)
            c3_exports(conn, user_ids)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    total = sum(rows_total.values())
    print(f"[mock] Loaded {total:,} rows across {len(rows_total)} tables in "
          f"{time.perf_counter() - t0:.2f}s")
    print("[mock] Users: demo@moneymind.local / partner@moneymind.local / family@moneymind.local")
    print("[mock] Demo password for all three users: Demo1234 (bcrypt, cost 12)")
    print("[mock] Tip: run db_setup.py first to reset the schema, then this script to seed it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
