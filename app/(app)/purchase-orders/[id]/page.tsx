import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { PurchaseOrderStatusBadge } from "@/components/patterns/purchase-order-status-badge";
import { Money } from "@/components/patterns/money";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPurchaseOrderById } from "../queries";
import { listProductOptions } from "../../products/queries";
import { PoItemEditor } from "../po-item-editor";
import { PoActions } from "../po-actions";
import { ReceivePoItemDialog } from "../receive-po-item-dialog";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  const po = await getPurchaseOrderById(id);
  if (!po) notFound();

  const [products, canManage] = await Promise.all([
    listProductOptions(organizationId),
    can("purchase_orders.manage", { organizationId, clinicId: po.clinicId }),
  ]);

  const isDraft = po.status === "draft";
  const isOpenForReceiving = po.status === "ordered" || po.status === "partially_received";
  const productTrackExpiration = new Map(products.map((p) => [p.id, p.trackExpiration]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={po.purchaseOrderNumber ?? "Draft purchase order"}
        description={`${po.supplierName} · ${po.clinicName ?? "Unknown clinic"}`}
        actions={<PoActions purchaseOrderId={po.id} status={po.status} canManage={canManage} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <PurchaseOrderStatusBadge status={po.status} />
                <span className="text-muted-foreground">
                  Ordered{" "}
                  {po.orderDate
                    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(po.orderDate),
                      )
                    : "—"}
                </span>
                <span className="text-muted-foreground">
                  Expected{" "}
                  {po.expectedDate
                    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(po.expectedDate),
                      )
                    : "—"}
                </span>
              </div>
            </div>

            <Separator />

            <h2 className="text-sm font-medium">Items</h2>
            {isDraft && canManage ? (
              <PoItemEditor purchaseOrderId={po.id} items={po.items} products={products} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Ordered</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Unit cost</TableHead>
                    <TableHead>Total</TableHead>
                    {isOpenForReceiving && canManage && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell>{item.quantityOrdered}</TableCell>
                      <TableCell
                        className={
                          Number(item.quantityReceived) < Number(item.quantityOrdered)
                            ? "text-muted-foreground"
                            : "text-primary"
                        }
                      >
                        {item.quantityReceived}
                      </TableCell>
                      <TableCell>
                        <Money value={item.unitCost} />
                      </TableCell>
                      <TableCell>
                        <Money value={item.totalCost} />
                      </TableCell>
                      {isOpenForReceiving && canManage && (
                        <TableCell>
                          {Number(item.quantityReceived) < Number(item.quantityOrdered) && (
                            <ReceivePoItemDialog
                              purchaseOrderId={po.id}
                              item={item}
                              trackExpiration={productTrackExpiration.get(item.productId) ?? false}
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {po.notes && (
            <Card className="gap-2 p-5">
              <h2 className="text-sm font-medium">Notes</h2>
              <p className="text-sm whitespace-pre-wrap">{po.notes}</p>
            </Card>
          )}
        </div>

        <Card className="h-fit gap-2 p-5">
          <h2 className="mb-1 text-sm font-medium">Summary</h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <Money value={po.subtotal} />
          </div>
          {Number(po.taxAmount) > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tax ({po.taxRate}%)</span>
              <Money value={po.taxAmount} />
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <Money value={po.total} />
          </div>
        </Card>
      </div>
    </div>
  );
}
