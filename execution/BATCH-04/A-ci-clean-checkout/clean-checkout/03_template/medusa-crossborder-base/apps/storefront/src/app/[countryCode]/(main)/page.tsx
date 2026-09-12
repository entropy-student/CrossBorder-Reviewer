import { Metadata } from "next"

import { getRegion } from "@lib/data/regions"
import Homepage from "@modules/home/templates/homepage"

export const metadata: Metadata = {
  title: "Pawfectly Home | Thoughtful essentials for happier homes",
  description:
    "Thoughtfully chosen pet essentials for calmer routines and happier homes.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  return <Homepage region={region} />
}
