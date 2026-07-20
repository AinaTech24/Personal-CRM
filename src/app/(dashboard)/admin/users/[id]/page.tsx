"use client";

import { useParams } from "next/navigation";
import { UserDetailView } from "@/components/admin/user-detail-view";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <UserDetailView userId={id} />;
}
