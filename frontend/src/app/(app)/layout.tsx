import AppShell from "@/components/AppShell";
import BackendWake from "@/components/BackendWake";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <BackendWake />
      {children}
    </AppShell>
  );
}
