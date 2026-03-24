import Link from "next/link";
import Image from "next/image";
import { ClientFilter } from "./client-filter";
import { ThemeToggle } from "./theme-toggle";

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#1a2d45] bg-[#111F32]">
      <div className="flex h-14 items-center px-4 md:px-6">
        <Link href="/" className="mr-4 flex items-center gap-2.5">
          <Image src="/logo.png" alt="Best Day Fitness" width={32} height={32} className="h-8 w-8" />
          <span className="text-lg font-semibold text-white">Best Day</span>
        </Link>
        <div className="hidden md:block">
          <ClientFilter />
        </div>
        <nav className="ml-auto hidden items-center gap-1 md:flex">
          <Link href="/record" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Record
          </Link>
          <Link href="/upload" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Upload
          </Link>
          <Link href="/library" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Library
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
