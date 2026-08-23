import { describe, expect, it } from "vitest";
import {
  createManualAsset,
  fixtureDb,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

describe("manual assets CRUD and validation", () => {
  it("creates, lists with category filter, reads, patches with lock and deletes", async () => {
    const homeId = await createManualAsset(db.alice, {
      name: "Family Home",
      category: "property",
      valuation: 8000000,
    });
    await createManualAsset(db.alice, {
      name: "Swift VXI",
      category: "vehicle",
      valuation: 650000,
    });

    let list = (await (
      await requestAs(db.alice, "/api/manual-assets")
    ).json()) as { assets: { id: string; name: string; valuation: number }[] };
    expect(list.assets).toHaveLength(2);
    // Ordered by valuation DESC.
    expect(list.assets[0].name ?? list.assets[0].id).toBeTruthy();
    expect(list.assets[0].valuation).toBe(8000000);

    const property = (await (
      await requestAs(db.alice, "/api/manual-assets?category=property")
    ).json()) as { assets: { name?: string }[] };
    expect(property.assets).toHaveLength(1);

    const detail = await requestAs(db.alice, `/api/manual-assets/${homeId}`);
    expect(detail.status).toBe(200);
    const assetBody = (await detail.json()) as {
      asset: { acquisition_date: string; category: string };
    };
    expect(assetBody.asset.acquisition_date).toBe("2020-06-15");
    expect(assetBody.asset.category).toBe("property");

    const patch = await requestAs(db.alice, `/api/manual-assets/${homeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ valuation: "8500000", version: 1 }),
    });
    expect(patch.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/manual-assets/${homeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ valuation: "10", version: 1 }),
    });
    expect(stale.status).toBe(409);

    const del = await requestAs(db.alice, `/api/manual-assets/${homeId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    expect(
      (await requestAs(db.alice, `/api/manual-assets/${homeId}`)).status
    ).toBe(404);
  });

  it("validates name, category, valuation and dates", async () => {
    const res = await postAsForErrors();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.name).toBeTruthy();
    expect(body.fieldErrors.category).toBeTruthy();
    expect(body.fieldErrors.valuation).toBeTruthy();
    expect(body.fieldErrors.acquisition_date).toBeTruthy();
  });

  it("exports CSV", async () => {
    await createManualAsset(db.alice, { name: "Export Villa" });
    const res = await requestAs(db.alice, "/api/manual-assets/export");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Name,Category,Valuation,Acquired");
    expect(text).toContain("Export Villa");
  });

  it("unknown ids return 404", async () => {
    expect(
      (
        await requestAs(
          db.alice,
          "/api/manual-assets/00000000-0000-4000-8000-000000000000"
        )
      ).status
    ).toBe(404);
  });
});

async function postAsForErrors() {
  return requestAs(db.alice, "/api/manual-assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "",
      category: "spaceship",
      valuation: "-2",
      acquisition_date: "not-a-date",
    }),
  });
}
