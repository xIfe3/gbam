import { Footer } from "@/components/brand/footer";
import { Header } from "@/components/brand/header";

// Same header and footer as the marketing pages.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
