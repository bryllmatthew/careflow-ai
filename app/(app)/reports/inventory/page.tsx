import { Warehouse } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { StockStatusBadge } from "@/components/patterns/stock-status-badge";
import { ExpirationBadge } from "@/components/patterns/expiration-badge";
import { ReportFilterBar } from "@/components/patterns/report-filter-bar";
import { ExportButton } from "@/components/patterns/export-button";
import { UrlTabs } from "@/components/patterns/url-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { movementTypeLabels } from "@/lib/validation/inventory.schema";
import { listInventory, listMovements } from "../../inventory/queries";
import { getReportingContext, parseReportSearchParams } from "../context";

/** Section 27: Stock / Movement / Low Stock / Expiration reports, in one page with tabs. */
export default async function InventoryReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("reports.inventory", { organizationId });

  const context = await getReportingContext(organizationId);
  const { range, clinicId } = parseReportSearchParams(params, context.timezone);

  const [{ rows: stock }, { rows: movements }] = await Promise.all([
    listInventory(organizationId, { clinicId, page: 1, pageSize: 500 }),
    listMovements(organizationId, {
      clinicId,
      startUtc: range.startUtc,
      endUtc: range.endUtc,
      page: 1,
      pageSize: 500,
    }),
  ]);

  const lowStock = stock.filter((r) => r.status === "low_stock" || r.status === "out_of_stock");
  const expiring = stock.filter((r) => r.earliestExpiration);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventory Reports"
        description="Stock, movements, low stock and expiration, in one place."
      />

      <ReportFilterBar clinics={context.clinics} />

      {stock.length === 0 && movements.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="Nothing to report yet"
          description="Reports fill in once products and stock exist."
        />
      ) : (
        <UrlTabs defaultValue="stock">
          <TabsList>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
            <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
            <TabsTrigger value="expiration">Expiration</TabsTrigger>
          </TabsList>

          <TabsContent value="stock" className="flex flex-col gap-3">
            <div className="flex justify-end">
              <ExportButton type="inventory" />
            </div>
            <Card className="p-0">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Clinic</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stock.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{r.clinicName}</TableCell>
                        <TableCell>
                          {r.quantityOnHand} {r.unitOfMeasure}
                        </TableCell>
                        <TableCell>
                          <StockStatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movements" className="flex flex-col gap-3">
            <div className="flex justify-end">
              <ExportButton type="inventory-movements" />
            </div>
            <Card className="p-0">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Clinic</TableHead>
                      <TableHead>Movement</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-muted-foreground">
                          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                            new Date(m.createdAt),
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{m.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{m.clinicName}</TableCell>
                        <TableCell>
                          {movementTypeLabels[m.movementType] ?? m.movementType}
                        </TableCell>
                        <TableCell
                          className={Number(m.quantity) < 0 ? "text-destructive" : "text-primary"}
                        >
                          {Number(m.quantity) > 0 ? "+" : ""}
                          {m.quantity}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.referenceType ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.createdByName ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="low-stock">
            {lowStock.length === 0 ? (
              <Card className="p-0">
                <EmptyState
                  icon={Warehouse}
                  title="Nothing low on stock"
                  description="Every product is above its reorder level."
                />
              </Card>
            ) : (
              <Card className="p-0">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Clinic</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Reorder level</TableHead>
                        <TableHead>Reorder quantity</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStock.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.productName}</TableCell>
                          <TableCell className="text-muted-foreground">{r.clinicName}</TableCell>
                          <TableCell>{r.quantityOnHand}</TableCell>
                          <TableCell className="text-muted-foreground">{r.reorderLevel}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.reorderQuantity}
                          </TableCell>
                          <TableCell>
                            <StockStatusBadge status={r.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="expiration">
            {expiring.length === 0 ? (
              <Card className="p-0">
                <EmptyState
                  icon={Warehouse}
                  title="Nothing tracked for expiration"
                  description="No batches are on file yet."
                />
              </Card>
            ) : (
              <Card className="p-0">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Clinic</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Earliest expiration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expiring.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.productName}</TableCell>
                          <TableCell className="text-muted-foreground">{r.clinicName}</TableCell>
                          <TableCell>{r.quantityOnHand}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.earliestExpiration}
                          </TableCell>
                          <TableCell>
                            <ExpirationBadge expirationDate={r.earliestExpiration} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </UrlTabs>
      )}
    </div>
  );
}
