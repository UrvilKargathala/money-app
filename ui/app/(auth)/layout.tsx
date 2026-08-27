import { Wallet } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-8">
      <Link href="/login" className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Wallet className="h-5 w-5" />
        </div>
        <span className="text-xl font-bold font-heading text-neutral-800">MoneyMind</span>
      </Link>
      <div className="w-full max-w-[420px]">{children}</div>
      <p className="mt-8 text-center text-xs text-neutral-400 font-body">
        Secure personal finance management • Your data, your control
      </p>
    </div>
  );
}
