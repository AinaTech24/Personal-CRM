"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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

const TODAY = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

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

  // The dashboard redirect happens on a timer once the Thank You screen is
  // showing, not immediately on success — give the animation room to play.
  useEffect(() => {
    if (!welcomeName) return;
    const timer = setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 3600);
    return () => clearTimeout(timer);
  }, [welcomeName, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/invites/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, surname, mobile, password, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setWelcomeName(name);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <AnimatePresence mode="wait">
        {welcomeName ? (
          <ThankYouScreen key="thanks" name={welcomeName} />
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
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
                {!loadError && !invite && <p className="text-sm text-muted-foreground">Loading invite...</p>}
                {invite && (
                  <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="name">First name</Label>
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="surname">Last name</Label>
                        <Input id="surname" value={surname} onChange={(e) => setSurname(e.target.value)} required />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="mobile">Mobile number</Label>
                      <Input
                        id="mobile"
                        type="tel"
                        inputMode="numeric"
                        placeholder="10-digit mobile number"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        required
                      />
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
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="pin">Set a 6-digit PIN</Label>
                      <Input
                        id="pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="••••••"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        You can sign in with your email + password, or your mobile + this PIN.
                      </p>
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
        )}
      </AnimatePresence>
    </div>
  );
}

/** Celebratory "you're in" screen — a few seconds of confetti-burst SVG before handing off to the dashboard. */
function ThankYouScreen({ name }: { name: string }) {
  const confetti = Array.from({ length: 14 }, (_, i) => i);
  const colors = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4"];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex w-full max-w-sm flex-col items-center gap-4 text-center"
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        <svg viewBox="0 0 120 120" className="absolute h-full w-full">
          {confetti.map((i) => {
            const angle = (i / confetti.length) * Math.PI * 2;
            const dist = 46 + (i % 3) * 8;
            return (
              <motion.circle
                key={i}
                cx={60}
                cy={60}
                r={i % 2 === 0 ? 3 : 4.5}
                fill={colors[i % colors.length]}
                initial={{ cx: 60, cy: 60, opacity: 0 }}
                animate={{
                  cx: 60 + Math.cos(angle) * dist,
                  cy: 60 + Math.sin(angle) * dist,
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 1.6, delay: 0.1 + i * 0.02, ease: "easeOut" }}
              />
            );
          })}
        </svg>
        <motion.svg
          viewBox="0 0 52 52"
          className="h-16 w-16 text-emerald-500"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
        >
          <motion.circle cx="26" cy="26" r="25" fill="none" stroke="currentColor" strokeWidth="2" opacity={0.25} />
          <motion.path
            d="M14 27l7 7 17-17"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
          />
        </motion.svg>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <h1 className="text-2xl font-semibold">Welcome aboard, {name}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account is all set up. We&apos;re glad to have you with us.</p>
        <p className="mt-3 text-xs text-muted-foreground">{TODAY}</p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="text-sm text-muted-foreground"
      >
        Taking you to your dashboard...
      </motion.p>
    </motion.div>
  );
}
