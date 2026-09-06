import { notFound } from "next/navigation";
import { Ban, RotateCcw, Pencil } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Money } from "@/components/patterns/money";
import { StockStatusBadge } from "@/components/patterns/stock-status-badge";
import { ExpirationBadge } from "@/components/patterns/expiration-badge";
import { movementTypeLabels, stockStatus } from "@/lib/validation/inventory.schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { getProductById, listProductInventoryByClinic } from "../queries";
import { setProductStatusAction } from "../actions";
import { listSupplierOptions } from "../../suppliers/queries";
import { listClinicOptions } from "../../patients/queries";
import { listProductMovements, listProductBatches } from "../../inventory/queries";
import { ProductFormDialog } from "../product-form-dialog";
import { ProductStatusForm } from "../product-status-form";
import { ReceiveStockDialog } from "../../inventory/receive-stock-dialog";
import { AdjustStockDialog } from "../../inventory/adjust-stock-dialog";
import { TransferStockDialog } from "../../inventory/transfer-stock-dialog";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  const product = await getProductById(id);
  if (!product) notFound();

  const [inventoryByClinic, movements, batches, clinics, suppliers, canManage] = await Promise.all([
    listProductInventoryByClinic(id),
    listProductMovements(id),
    product.trackExpiration ? listProductBatches(id) : Promise.resolve([]),
    listClinicOptions(organizationId),
    listSupplierOptions(organizationId),
    can("products.manage", { organizationId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product.name}
        description={
          [product.sku, product.category, product.brand].filter(Boolean).join(" · ") ||
          "No SKU or category set"
        }
        actions={
          <PermissionGate allowed={canManage}>
            <div className="flex gap-2">
              <ProductFormDialog
                product={product}
                suppliers={suppliers}
                trigger={
                  <Button variant="outline" size="sm">
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                }
              />
              {product.status === "active" ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Ban className="size-4" />
                      Deactivate
                    </Button>
                  }
                  title="Deactivate this product?"
                  description="It stays in history and every past transaction is preserved -- it's just hidden from new purchase orders and service requirements."
                  confirmLabel="Deactivate"
                  onConfirm={async () => {
                    "use server";
                    await setProductStatusAction(product.id, "inactive");
                  }}
                />
              ) : (
                <ProductStatusForm
                  productId={product.id}
                  nextStatus="active"
                  label="Reactivate"
                  icon={<RotateCcw className="size-4" />}
                />
              )}
            </div>
          </PermissionGate>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Stock by clinic</h2>
              <PermissionGate allowed={canManage}>
                <div className="flex flex-wrap gap-2">
                  {product.trackInventory && (
                    <>
                      <ReceiveStockDialog
                        clinics={clinics}
                        productId={product.id}
                        productName={product.name}
                        unitCost={product.unitCost}
                        trackExpiration={product.trackExpiration}
                        trigger={<Button size="sm">Receive stock</Button>}
                      />
                      <AdjustStockDialog
                        clinics={clinics}
                        productId={product.id}
                        productName={product.name}
                        trackExpiration={product.trackExpiration}
                        trigger={
                          <Button size="sm" variant="outline">
                            Adjust
                          </Button>
                        }
                      />
                      {clinics.length > 1 && (
                        <TransferStockDialog
                          clinics={clinics}
                          productId={product.id}
                          productName={product.name}
                          trigger={
                            <Button size="sm" variant="outline">
                              Transfer
                            </Button>
                          }
                        />
                      )}
                    </>
                  )}
                </div>
              </PermissionGate>
            </div>

            {!product.trackInventory ? (
              <p className="text-muted-foreground text-sm">
                This product does not track inventory.
              </p>
            ) : inventoryByClinic.length === 0 ? (
              <p className="text-muted-foreground text-sm">No stock recorded at any clinic yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clinic</TableHead>
                    <TableHead>On hand</TableHead>
                    <TableHead>Reorder level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last received</TableHead>
                    <TableHead>Last used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryByClinic.map((row) => (
                    <TableRow key={row.clinicId}>
                      <TableCell className="font-medium">{row.clinicName}</TableCell>
                      <TableCell>
                        {row.quantityOnHand} {product.unitOfMeasure}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.reorderLevel}</TableCell>
                      <TableCell>
                        <StockStatusBadge
                          status={stockStatus(Number(row.quantityOnHand), Number(row.reorderLevel))}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.lastReceivedAt
                          ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                              new Date(row.lastReceivedAt),
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.lastUsedAt
                          ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                              new Date(row.lastUsedAt),
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {product.trackExpiration && (
            <Card className="gap-3 p-5">
              <h2 className="text-sm font-medium">Batches</h2>
              {batches.length === 0 ? (
                <p className="text-muted-foreground text-sm">No batches received yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clinic</TableHead>
                      <TableHead>Batch #</TableHead>
                      <TableHead>Lot #</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-muted-foreground">{b.clinicName}</TableCell>
                        <TableCell>{b.batchNumber ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.lotNumber ?? "—"}
                        </TableCell>
                        <TableCell>{b.quantityRemaining}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.expirationDate ?? "—"}
                        </TableCell>
                        <TableCell>
                          <ExpirationBadge expirationDate={b.expirationDate} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          <Card className="gap-3 p-5">
            <h2 className="text-sm font-medium">Movement history</h2>
            {movements.length === 0 ? (
              <p className="text-muted-foreground text-sm">No stock movements recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Clinic</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Before → After</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(m.createdAt))}
                      </TableCell>
                      <TableCell>{m.clinicName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {movementTypeLabels[m.movementType] ?? m.movementType}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={Number(m.quantity) < 0 ? "text-destructive" : "text-primary"}
                      >
                        {Number(m.quantity) > 0 ? "+" : ""}
                        {m.quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.quantityBefore} → {m.quantityAfter}
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
            )}
          </Card>
        </div>

        <Card className="h-fit gap-2 p-5">
          <h2 className="mb-1 text-sm font-medium">Details</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge variant={product.status === "active" ? "default" : "secondary"}>
                {product.status === "active" ? "Active" : "Inactive"}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">Unit</dt>
            <dd>{product.unitOfMeasure}</dd>
            <dt className="text-muted-foreground">Unit cost</dt>
            <dd>
              <Money value={product.unitCost} currency={product.currency} />
            </dd>
            <dt className="text-muted-foreground">Selling price</dt>
            <dd>
              {product.sellingPrice ? (
                <Money value={product.sellingPrice} currency={product.currency} />
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted-foreground">Barcode</dt>
            <dd>{product.barcode ?? "—"}</dd>
            <dt className="text-muted-foreground">Tracks inventory</dt>
            <dd>{product.trackInventory ? "Yes" : "No"}</dd>
            <dt className="text-muted-foreground">Tracks expiration</dt>
            <dd>{product.trackExpiration ? "Yes" : "No"}</dd>
          </dl>
          <Separator className="my-1" />
          <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
            Preferred supplier
          </h3>
          <p className="text-sm">{product.supplierName ?? "None set"}</p>
          {product.supplierSku && (
            <p className="text-muted-foreground text-xs">Supplier SKU: {product.supplierSku}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
