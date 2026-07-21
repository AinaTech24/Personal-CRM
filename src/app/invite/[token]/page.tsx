"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconEye, IconEyeOff } from "@/components/icons";

interface InviteInfo {
  email: string;
  role: string;
  department: { name: string } | null;
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${params.token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? "Invite not found");
          return;
        }
        setInvite(data.invite);
      })
      .catch(() => setLoadError("Failed to load invite"));
  }, [params.token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/invites/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader>
            <Image src="/logo.png" alt="Aina CRM" width={180} height={75} priority unoptimized className="mb-2 h-12 w-auto self-center" />
            <CardTitle className="text-xl">Accept your invite</CardTitle>
            {invite && (
              <CardDescription>
                Joining as {invite.email}
                {invite.department ? ` · ${invite.department.name}` : ""}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
            {!loadError && !invite && (
              <p className="text-sm text-muted-foreground">Loading invite...</p>
            )}
            {invite && (
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Set a password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="pr-9"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Creating account..." : "Create account"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
