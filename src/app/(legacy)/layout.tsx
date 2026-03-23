import { Header } from "@/components/layout/header";

export default function LegacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
