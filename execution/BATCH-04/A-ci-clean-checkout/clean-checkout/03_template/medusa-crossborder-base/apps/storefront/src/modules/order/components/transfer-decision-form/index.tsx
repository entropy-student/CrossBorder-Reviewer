"use client"

import { useActionState } from "react"
import { Button, Text } from "@modules/common/components/ui"
import { HttpTypes } from "@medusajs/types"

type TransferState = { success: boolean; error: string | null; order: HttpTypes.StoreOrder | null }

export default function TransferDecisionForm({
  action,
  orderId,
  token,
  verb,
}: {
  action: (state: TransferState, formData: FormData) => Promise<TransferState>
  orderId: string
  token: string
  verb: "accept" | "decline"
}) {
  const [state, formAction, pending] = useActionState(action, { success: false, error: null, order: null })
  return state.success ? (
    <Text>Order transfer {verb === "accept" ? "accepted" : "declined"}.</Text>
  ) : (
    <form action={formAction} className="flex flex-col gap-y-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending}>{pending ? "Working…" : `Confirm ${verb}`}</Button>
      {state.error && <Text className="text-red-500" role="alert">{state.error}</Text>}
    </form>
  )
}
