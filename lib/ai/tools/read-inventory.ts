import { z } from "zod";
import { listInventory, listMovements, getInventoryMetrics } from "@/app/(app)/inventory/queries";
import { movementTypeLabels } from "@/lib/validation/inventory.schema";
import { defineReadTool } from "./types";
import { clinicIdSchema, resolveClinicId, rangeInputSchema, resolveRange } from "./shared";

const movementTypes = Object.keys(movementTypeLabels) as [string, ...string[]];

export const getInventoryStatusTool = defineReadTool({
  name: "get_inventory_status",
  description:
    "Overall inventory health: total active products, total inventory value, and counts of low-stock/out-of-stock/expiring-soon/expired items.",
  schema: z.object({}),
  permission: "inventory.view",
  handler: async (_input, ctx) => {
    const metrics = await getInventoryMetrics(ctx.organizationId);
    return { ok: true, data: { currency: ctx.currency, ...metrics } };
  },
});

export const getLowStockItemsTool = defineReadTool({
  name: "get_low_stock_items",
  description:
    "Products currently at or below their minimum quantity (or out of stock), with current quantity, minimum quantity, and clinic.",
  schema: z.object({
    clinicId: clinicIdSchema,
    outOfStockOnly: z.boolean().optional(),
  }),
  permission: "inventory.view",
  handler: async (input, ctx) => {
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const result = await listInventory(ctx.organizationId, {
      clinicId,
      status: input.outOfStockOnly ? "out_of_stock" : "low_stock",
      pageSize: 50,
    });
    return { ok: true, data: { total: result.total, items: result.rows.slice(0, 30) } };
  },
});

export const getInventoryUsageTool = defineReadTool({
  name: "get_inventory_usage",
  description:
    "Historical inventory movement (consumption, receiving, adjustments, transfers) for a period -- 'what supplies are we using the most' questions.",
  schema: rangeInputSchema.extend({
    clinicId: clinicIdSchema,
    movementType: z.enum(movementTypes).optional(),
  }),
  permission: "inventory.view",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "this_month");
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const result = await listMovements(ctx.organizationId, {
      clinicId,
      movementType: input.movementType,
      startUtc: range.startUtc,
      endUtc: range.endUtc,
      pageSize: 50,
    });
    return {
      ok: true,
      data: { period: range.label, total: result.total, movements: result.rows.slice(0, 30) },
    };
  },
});
