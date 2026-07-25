"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { IconEye, IconEyeOff } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

/** Parses a fetch Response as JSON, tolerating empty/non-JSON error bodies (e.g. a bare 500). */
async function safeJson(res: Response): Promise<{ error?: string; [key: string]: unknown }> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <LoginFormInner />
    </Suspense>
  );
}

type Mode =
  | "login"
  | "login-pin"
  | "forgot-email"
  | "forgot-code"
  | "forgot-pin-mobile"
  | "forgot-pin-code";

const CARD_COPY: Record<Mode, string> = {
  login: "Sign in with your @ainatech.in account",
  "login-pin": "Sign in with your mobile number and PIN",
  "forgot-email": "Enter your account email to receive a sign-in code",
  "forgot-code": "Enter the code we emailed you",
  "forgot-pin-mobile": "Enter your mobile number to receive a reset code",
  "forgot-pin-code": "Enter the code we emailed you and choose a new PIN",
};

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinResetCode, setPinResetCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const method: "password" | "pin" =
    mode === "login-pin" || mode === "forgot-pin-mobile" || mode === "forgot-pin-code" ? "pin" : "password";

  function goNext(welcomeName: string) {
    // The toast outlives the navigation: ToastProvider sits above the router in
    // the root layout, and this is a client-side push rather than a reload.
    toast.success("Signed in", `Welcome back, ${welcomeName}`);
    const next = searchParams.get("next") ?? "/";
    router.push(next);
    router.refresh();
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        toast.error("Couldn't sign in", data.error ?? "Something went wrong. Please try again.");
        return;
      }
      goNext(email);
    } catch {
      toast.error("Couldn't sign in", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onLoginPin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, pin }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        toast.error("Couldn't sign in", data.error ?? "Something went wrong. Please try again.");
        return;
      }
      goNext(mobile);
    } catch {
      toast.error("Couldn't sign in", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        toast.error("Couldn't send the code", data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setInfo(`We sent a 6-digit code to ${email}. It expires in 10 minutes.`);
      toast.success("Code sent", `Check ${email}`);
      setMode("forgot-code");
    } catch {
      toast.error("Couldn't send the code", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        toast.error("Couldn't verify code", data.error ?? "Invalid code");
        return;
      }
      goNext(email);
    } catch {
      toast.error("Couldn't verify code", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onSendPinCode(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        toast.error("Couldn't send the code", data.error ?? "Something went wrong. Please try again.");
        return;
      }
      const sentTo = typeof data.email === "string" ? data.email : "your registered email";
      setInfo(`We sent a 6-digit code to ${sentTo}. It expires in 10 minutes.`);
      toast.success("Code sent", `Check ${sentTo}`);
      setMode("forgot-pin-code");
    } catch {
      toast.error("Couldn't send the code", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(newPin)) {
      toast.error("PIN must be exactly 6 digits");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code: pinResetCode, newPin }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        toast.error("Couldn't reset PIN", data.error ?? "Invalid code");
        return;
      }
      toast.success("PIN reset");
      goNext(mobile);
    } catch {
      toast.error("Couldn't reset PIN", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setInfo(null);
    setPassword("");
    setCode("");
    setPin("");
    setPinResetCode("");
    setNewPin("");
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
            <Image src="/logo.png" alt="Aina CRM" width={180} height={75} priority unoptimized className="mb-2 h-14 w-auto self-center" />
            <CardDescription>{CARD_COPY[mode]}</CardDescription>
          </CardHeader>
          <CardContent>
            {(mode === "login" || mode === "login-pin") && (
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className={cn(
                    "rounded-sm py-1.5 text-sm font-medium transition-colors",
                    method === "password" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("login-pin")}
                  className={cn(
                    "rounded-sm py-1.5 text-sm font-medium transition-colors",
                    method === "pin" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Mobile &amp; PIN
                </button>
              </div>
            )}

            {mode === "login" && (
              <form onSubmit={onLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@ainatech.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => switchMode("forgot-email")}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="pr-9"
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
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            )}

            {mode === "login-pin" && (
              <form onSubmit={onLoginPin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="login-mobile">Mobile number</Label>
                  <Input
                    id="login-mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-pin">PIN</Label>
                    <button
                      type="button"
                      onClick={() => switchMode("forgot-pin-mobile")}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot PIN?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-pin"
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      autoComplete="current-password"
                      maxLength={6}
                      className="pr-9 tracking-[0.3em]"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((v) => !v)}
                      aria-label={showPin ? "Hide PIN" : "Show PIN"}
                      className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    >
                      {showPin ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            )}

            {mode === "forgot-email" && (
              <form onSubmit={onSendCode} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@ainatech.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Sending code..." : "Send code"}
                </Button>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  Back to sign in
                </button>
              </form>
            )}

            {mode === "forgot-code" && (
              <form onSubmit={onVerifyCode} className="flex flex-col gap-4">
                {info && <p className="text-sm text-emerald-500">{info}</p>}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">Verification code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={6}
                    className="text-center text-lg tracking-[0.5em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Verifying..." : "Verify & sign in"}
                </Button>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button type="button" onClick={() => switchMode("forgot-email")} className="hover:text-foreground">
                    Change email
                  </button>
                  <button type="button" onClick={onSendCode} className="hover:text-foreground">
                    Resend code
                  </button>
                </div>
              </form>
            )}

            {mode === "forgot-pin-mobile" && (
              <form onSubmit={onSendPinCode} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="forgot-pin-mobile">Mobile number</Label>
                  <Input
                    id="forgot-pin-mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll email a reset code to the address on your account.
                </p>
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Sending code..." : "Send code"}
                </Button>
                <button
                  type="button"
                  onClick={() => switchMode("login-pin")}
                  className="text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  Back to sign in
                </button>
              </form>
            )}

            {mode === "forgot-pin-code" && (
              <form onSubmit={onResetPin} className="flex flex-col gap-4">
                {info && <p className="text-sm text-emerald-500">{info}</p>}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pin-reset-code">Verification code</Label>
                  <Input
                    id="pin-reset-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={6}
                    className="text-center text-lg tracking-[0.5em]"
                    value={pinResetCode}
                    onChange={(e) => setPinResetCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-pin">New PIN</Label>
                  <Input
                    id="new-pin"
                    inputMode="numeric"
                    autoComplete="new-password"
                    placeholder="6 digits"
                    maxLength={6}
                    className="text-center text-lg tracking-[0.3em]"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Resetting..." : "Reset PIN & sign in"}
                </Button>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button type="button" onClick={() => switchMode("forgot-pin-mobile")} className="hover:text-foreground">
                    Change mobile
                  </button>
                  <button type="button" onClick={onSendPinCode} className="hover:text-foreground">
                    Resend code
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Access is invite-only. Contact your admin if you need an account.
        </p>
      </motion.div>
    </div>
  );
}
