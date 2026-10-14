import { getFlyerById } from "@/lib/instagram/data"
import { FlyerModal } from "@/components/flyer-modal"
import { notFound } from "next/navigation"

interface FlyerModalPageProps {
  params: Promise<{ id: string }>
}

export default async function FlyerModalPage({ params }: FlyerModalPageProps) {
  const { id } = await params
  const flyer = await getFlyerById(id)

  if (!flyer) {
    notFound()
  }

  return <FlyerModal flyer={flyer} />
}
