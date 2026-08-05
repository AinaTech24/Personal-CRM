"use client";

import { useParams } from "next/navigation";
import { SocialClientDetailView } from "@/components/social-media/client-detail-view";

export default function SocialClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <SocialClientDetailView clientId={id} />;
}
