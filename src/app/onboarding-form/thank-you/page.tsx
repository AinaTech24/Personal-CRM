import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { IconCheck } from "@/components/icons";

export default function OnboardingThankYouPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Image src="/logo.png" alt="Aina CRM" width={140} height={58} priority unoptimized className="h-10 w-auto" />
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <IconCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Thank you!</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ve received your website onboarding details. Our team will reach out to you shortly.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
