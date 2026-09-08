"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, QrCode, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bookingPageUrl, bookingQrSvg } from "@/lib/booking/links";

/**
 * Copy / open / QR for one booking URL. Used on the booking dashboard for a
 * clinic's main page and on the detail page for each campaign link, so the
 * three actions behave identically wherever a booking URL appears.
 */
export function BookingLinkActions({
  slug,
  name,
  linkToken,
  compact = false,
}: {
  slug: string;
  name: string;
  linkToken?: string;
  compact?: boolean;
}) {
  const url = bookingPageUrl(slug, linkToken);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Booking link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some embedded browsers and over plain
      // HTTP. Say so instead of silently doing nothing.
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size={compact ? "icon-sm" : "sm"}
        onClick={copy}
        aria-label="Copy booking link"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {!compact && (copied ? "Copied" : "Copy link")}
      </Button>

      <Button
        variant="outline"
        size={compact ? "icon-sm" : "icon-sm"}
        asChild
        aria-label="Open booking page"
      >
        {/* rel="noreferrer" so the clinic's own admin URL never leaks into a
            Referer header on the public page. */}
        <a href={url} target="_blank" rel="noreferrer noopener">
          <ExternalLink className="size-4" />
        </a>
      </Button>

      <QrDialog url={url} name={name} slug={slug} linkToken={linkToken} />
    </div>
  );
}

function QrDialog({
  url,
  name,
  slug,
  linkToken,
}: {
  url: string;
  name: string;
  slug: string;
  linkToken?: string;
}) {
  const [open, setOpen] = useState(false);

  // Encoded on demand rather than on every render of the parent list: a page
  // with a dozen links would otherwise run a dozen QR encodes nobody looks at.
  const svg = open ? bookingQrSvg(url) : null;

  function download() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${slug}${linkToken ? `-${linkToken}` : ""}-booking-qr.svg`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Show QR code">
          <QrCode className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan to book</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>

        {svg && (
          <div className="flex flex-col items-center gap-4">
            {/*
              The QR encodes only the public booking URL -- no patient
              information and no identifiers of any kind (brief section 31).
              An SVG so it stays sharp printed at any size.
            */}
            {/*
              The markup is generated locally by uqr from a URL this app
              constructed from a validated slug -- no user-supplied string ever
              reaches this attribute.
            */}
            <div
              className="bg-card w-full max-w-[240px] rounded-xl border p-3 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="text-muted-foreground text-center text-xs break-all">{url}</p>
            <Button variant="outline" size="sm" onClick={download} className="w-full">
              <Download className="size-4" aria-hidden />
              Download SVG
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
