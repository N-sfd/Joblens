"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, PlayCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  className?: string;
}

export default function CtaButtons({ className }: Props) {
  const router = useRouter();
  const [loadingDemo, setLoadingDemo] = useState(false);

  const tryDemo = async () => {
    setLoadingDemo(true);
    try {
      await api.loadDemoJobs();
    } catch {
      // Demo seed optional — still route to Career Intelligence.
    } finally {
      setLoadingDemo(false);
      router.push("/match");
    }
  };

  return (
    <div className={`flex flex-wrap gap-3 ${className ?? ""}`}>
      <Link href="/match" className="btn-primary flex items-center gap-2 text-base py-3 px-6">
        Analyze Resume Against a Job <ArrowRight size={16} />
      </Link>
      <button
        type="button"
        onClick={tryDemo}
        disabled={loadingDemo}
        className="btn-secondary flex items-center gap-2 text-base py-3 px-6 disabled:opacity-60"
      >
        {loadingDemo ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
        Try Demo
      </button>
    </div>
  );
}
