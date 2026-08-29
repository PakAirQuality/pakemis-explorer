import { redirect } from "next/navigation";

/** /r/<receipt> is the short form of /data?receipt=<receipt>: a receipt is a URL. */
export default async function ReceiptRedirect({ params }: { params: Promise<{ receipt: string }> }) {
  const { receipt } = await params;
  redirect(`/data?receipt=${encodeURIComponent(receipt)}`);
}
