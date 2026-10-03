import { Footer } from "@/components/brand/footer";
import { Header } from "@/components/brand/header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
