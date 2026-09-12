import { acceptTransferRequestAction } from "@lib/data/orders"
import { Heading, Text } from "@modules/common/components/ui"
import TransferImage from "@modules/order/components/transfer-image"
import TransferDecisionForm from "@modules/order/components/transfer-decision-form"

export default async function TransferPage({
  params,
}: {
  params: { id: string; token: string }
}) {
  const { id, token } = params

  return (
    <div className="flex flex-col gap-y-4 items-start w-2/5 mx-auto mt-10 mb-20">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        <Heading level="h1" className="text-xl text-zinc-900">Confirm order transfer</Heading>
        <Text className="text-zinc-600">Confirm transfer of order {id} to this account.</Text>
        <TransferDecisionForm action={acceptTransferRequestAction} orderId={id} token={token} verb="accept" />
      </div>
    </div>
  )
}
